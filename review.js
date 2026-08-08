import { dbService } from './db.service.js';
import { authService } from './auth.service.js';
import { practiceEngine } from './practice-engine.js';
import { offlineSyncService } from './offline-sync.service.js';

// State management
let reviewWords = [];
let currentWordIndex = 0;
let sessionResults = [];

let progressBar, progressText; // DOM element references
let gameModeContainer;
let currentActiveGameMode = null;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export async function renderReviewSession(rootElement) {
    // 1. Tải CSS (tái sử dụng từ practice)
    if (!document.querySelector('link[href="/practice-session.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/practice-session.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML (tái sử dụng từ practice)
    const response = await fetch('/practice-session.html');
    if (!response.ok) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Error loading review session.</p>`;
        return;
    }
    const html = await response.text();
    rootElement.innerHTML = html;

    // 3. Lấy dữ liệu từ cần ôn tập
    const { data: { user } } = await authService.getUser();
    const { data, error } = await dbService.getDueReviewWords(user.id);

    if (error) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Error fetching review words.</p>`;
        return;
    }

    if (data.length === 0) {
        rootElement.innerHTML = `
            <div style="text-align: center; padding: 4rem;">
                <h1>All Caught Up!</h1>
                <p>You have no words to review right now. Great job!</p>
                <a href="#/" class="btn-primary" style="text-decoration: none; margin-top: 2rem; display: inline-block;">Back to Library</a>
            </div>`;
        return;
    }

    reviewWords = data.map(item => item.word_senses).filter(Boolean);
    shuffleArray(reviewWords);

    // 4. Thiết lập event listeners và bắt đầu
    setupReviewEventListeners();
    startSession();
}

function setupReviewEventListeners() {
    const exitBtn = document.getElementById('exit-practice-btn');
    exitBtn.href = `#/`;

    progressBar = document.getElementById('progress-bar');
    progressText = document.getElementById('progress-text');
    gameModeContainer = document.getElementById('game-mode-container');
}

function startSession() {
    currentWordIndex = 0;
    sessionResults = [];
    loadWord(currentWordIndex);
}

async function loadWord(index) {
    if (index >= reviewWords.length) {
        showCompletionScreen();
        return;
    }

    if (currentActiveGameMode && currentActiveGameMode.cleanup) {
        currentActiveGameMode.cleanup();
    }

    const wordData = reviewWords[index];
    const gameMode = await practiceEngine.getGameModeForWord(wordData, null); // No setId for review
    currentActiveGameMode = gameMode;

    if (gameMode) {
        await practiceEngine.run(gameMode, wordData, gameModeContainer, handleGameModeComplete, null);
    }

    updateProgress();
}

function handleGameModeComplete(result) {
    sessionResults.push({
        word_sense_id: reviewWords[currentWordIndex].id,
        wrongAttempts: result.wrongAttempts,
    });
    currentWordIndex++;
    loadWord(currentWordIndex);
}

function updateProgress() {
    const progress = (currentWordIndex / reviewWords.length) * 100;
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${currentWordIndex}/${reviewWords.length}`;
}

async function showCompletionScreen() {
    await saveSessionProgress();
    gameModeContainer.innerHTML = `<div style="text-align: center;"><h1>Congratulations!</h1><p>You have completed this review session.</p><p>Your progress has been saved.</p><a href="#/" class="btn-primary" style="text-decoration: none; margin-top: 2rem; display: inline-block;">Back to Library</a></div>`;
    progressBar.style.width = '100%';
    progressText.textContent = `${reviewWords.length}/${reviewWords.length}`;
}

async function saveSessionProgress() {
    const { data: { user } } = await authService.getUser();
    if (!user || sessionResults.length === 0) return;
    
    const wordSenseIds = sessionResults.map(r => r.word_sense_id);
    const { data: currentProgressList, error: progressError } = await dbService.getCurrentProgressForWords(user.id, wordSenseIds);
    if (progressError && navigator.onLine) { console.error("Could not fetch current progress", progressError); }
    const currentProgressMap = new Map(currentProgressList?.map(p => [p.word_sense_id, p.mastery_level]) || []);

    let newlyLearnedCount = 0;
    const progressUpdates = sessionResults.map(result => {
        const currentMastery = currentProgressMap.get(result.word_sense_id) || 0;
        let newMastery;

        if (result.wrongAttempts === 0) {
            // Correct on first try -> increase mastery
            newMastery = Math.min(currentMastery + 1, 5);
            if (currentMastery === 0) {
                newlyLearnedCount++; // Đếm từ mới học (từ Unseen -> Novice)
            }
        } else {
            // Correct with hints -> decrease mastery
            newMastery = Math.max(currentMastery - 1, 0);
        }

        const reviewIntervals = [4, 8, 24, 72, 168, 336]; // in hours
        const reviewDueAt = new Date();
        reviewDueAt.setHours(reviewDueAt.getHours() + reviewIntervals[newMastery]);

        return {
            user_id: user.id,
            word_sense_id: result.word_sense_id,
            mastery_level: newMastery,
            review_due_at: reviewDueAt.toISOString(),
            last_reviewed_at: new Date().toISOString(),
        };
    });

    if (navigator.onLine) {
        try {
            const { error } = await dbService.updateUserProgress(progressUpdates);
            if (error) {
                console.error("Failed to save progress, queuing for later:", error);
                await offlineSyncService.addToOutbox(progressUpdates);
            } else {
                await dbService.logDailyActivity(); // Ghi nhận hoạt động
                await dbService.logLearningActivity(newlyLearnedCount); // Ghi nhận số từ mới học
            }
        } catch (e) {
             await offlineSyncService.addToOutbox(progressUpdates);
        }
    } else {
        console.log('Offline. Queuing progress updates.');
        await offlineSyncService.addToOutbox(progressUpdates);
    }
}

export function cleanup() {
    if (currentActiveGameMode && currentActiveGameMode.cleanup) {
        currentActiveGameMode.cleanup();
    }
    // Clear global state for review session
    reviewWords = [];
    currentWordIndex = 0;
    sessionResults = [];
    currentActiveGameMode = null;
}
