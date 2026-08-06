import { dbService } from './db.service.js';
import { authService } from './auth.service.js';
import { ttsService } from './tts.service.js';

// State management
let reviewWords = [];
let currentWordIndex = 0;
let sessionResults = [];
let wrongAttempts = 0;

// DOM element references
let progressBar, progressText;
let flashcardView, typingView;
let flashcard, flashcardFront, flashcardBack, flipBtn;
let typingMeaning, typingInput, hintArea, typingAudioBtn;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export async function renderReviewSession(rootElement) {
    // 1. Tải CSS (tái sử dụng từ practice)
    if (!document.querySelector('link[href="/practice.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/practice.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML (tái sử dụng từ practice)
    const response = await fetch('/practice.html');
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
    document.getElementById('exit-practice-btn').href = `#/`;

    progressBar = document.getElementById('progress-bar');
    progressText = document.getElementById('progress-text');
    flashcardView = document.getElementById('flashcard-view');
    typingView = document.getElementById('typing-view');
    flashcard = document.getElementById('flashcard');
    flashcardFront = document.getElementById('flashcard-front');
    flashcardBack = document.getElementById('flashcard-back');
    flipBtn = document.getElementById('flip-btn');
    typingMeaning = document.getElementById('typing-meaning');
    typingInput = document.getElementById('typing-input');
    hintArea = document.getElementById('hint-area');
    typingAudioBtn = document.getElementById('typing-audio-btn');

    flipBtn.addEventListener('click', handleFlip);
    typingInput.addEventListener('keydown', handleTyping);
}

function startSession() {
    currentWordIndex = 0;
    sessionResults = [];
    loadWord(currentWordIndex);
}

function loadWord(index) {
    if (index >= reviewWords.length) {
        showCompletionScreen();
        return;
    }
    const wordData = reviewWords[index];
    flashcardView.classList.remove('hidden');
    typingView.classList.add('hidden');
    flashcard.classList.remove('flipped');
    flashcardFront.textContent = wordData.meaning;
    flashcardBack.innerHTML = `
        <div class="word-and-audio">
            <span>${wordData.words.word}</span>
            <button id="flashcard-audio-btn" class="audio-btn" title="Listen">🔊</button>
        </div>
        <div>/${wordData.words.ipa || '...'}/</div>
        <div style="font-style: italic; color: var(--text-secondary); margin-top: 1rem;">"${wordData.example || 'No example'}"</div>`;
    document.getElementById('flashcard-audio-btn').addEventListener('click', () => {
        ttsService.speak(wordData.words.word);
    });
    typingMeaning.textContent = wordData.meaning;
    typingInput.value = '';
    typingAudioBtn.onclick = () => ttsService.speak(wordData.words.word);
    typingInput.classList.remove('wrong');
    hintArea.textContent = '';
    wrongAttempts = 0;
    updateProgress();
}

function handleFlip() {
    flashcard.classList.add('flipped');
    setTimeout(() => {
        flashcardView.classList.add('hidden');
        typingView.classList.remove('hidden');
        typingInput.focus();
    }, 600);
}

function handleTyping(event) {
    typingInput.classList.remove('wrong');
    if (event.key !== 'Enter') return;
    const userAnswer = typingInput.value.trim().toLowerCase();
    const correctAnswer = reviewWords[currentWordIndex].words.word.trim().toLowerCase();
    if (userAnswer === correctAnswer) {
        ttsService.speak(correctAnswer); // Auditory reinforcement
        sessionResults.push({ word_sense_id: reviewWords[currentWordIndex].id, wrongAttempts });
        currentWordIndex++;
        loadWord(currentWordIndex);
    } else {
        typingInput.classList.add('wrong');
        wrongAttempts++;
        showHint(correctAnswer);
    }
}

function showHint(correctAnswer) {
    let hint = '';
    const vowels = 'aeiou';
    switch (wrongAttempts) {
        case 1: hint = correctAnswer[0] + ' _'.repeat(correctAnswer.length - 1); break;
        case 2: hint = correctAnswer.length > 1 ? correctAnswer[0] + ' _'.repeat(correctAnswer.length - 2) + ' ' + correctAnswer.slice(-1) : correctAnswer[0]; break;
        case 3: hint = correctAnswer.split('').map(char => vowels.includes(char.toLowerCase()) ? char : '_').join(' '); break;
        default: hint = `Answer: ${correctAnswer}`; break;
    }
    hintArea.textContent = hint;
}

function updateProgress() {
    const progress = (currentWordIndex / reviewWords.length) * 100;
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${currentWordIndex}/${reviewWords.length}`;
}

async function showCompletionScreen() {
    await saveSessionProgress();
    document.getElementById('practice-main').innerHTML = `<div style="text-align: center;"><h1>Congratulations!</h1><p>You have completed this review session.</p><p>Your progress has been saved.</p><a href="#/" class="btn-primary" style="text-decoration: none; margin-top: 2rem; display: inline-block;">Back to Library</a></div>`;
    progressBar.style.width = '100%';
    progressText.textContent = `${reviewWords.length}/${reviewWords.length}`;
}

async function saveSessionProgress() {
    const { data: { user } } = await authService.getUser();
    if (!user || sessionResults.length === 0) return;

    const wordSenseIds = sessionResults.map(r => r.word_sense_id);
    const { data: currentProgressList } = await dbService.supabase
        .from('user_progress')
        .select('word_sense_id, mastery_level')
        .in('word_sense_id', wordSenseIds)
        .eq('user_id', user.id);

    const currentProgressMap = new Map(currentProgressList.map(p => [p.word_sense_id, p.mastery_level]));

    const progressUpdates = sessionResults.map(result => {
        const currentMastery = currentProgressMap.get(result.word_sense_id) || 0;
        let newMastery = result.wrongAttempts === 0 ? Math.min(currentMastery + 1, 5) : Math.max(currentMastery - 1, 0);
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

    const { error } = await dbService.updateUserProgress(progressUpdates);
    if (error) console.error("Failed to save progress:", error);
}

// Cần export dbService để truy cập supabase client trong saveSessionProgress
export { dbService as reviewDbService };