import { dbService } from './db.service.js';
import { authService } from './auth.service.js';
import { ttsService } from './tts.service.js';

// State management for the practice session
let practiceWords = [];
let currentWordIndex = 0;
let sessionResults = [];
let currentSetId = null;
let wrongAttempts = 0;

// DOM element references
let progressBar, progressText;
let flashcardView, typingView;
let flashcard, flashcardFront, flashcardBack, flipBtn;
let typingMeaning, typingInput, hintArea, typingAudioBtn;

/**
 * Shuffles an array in place.
 * @param {Array} array The array to shuffle.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Loads and renders the Practice component.
 * @param {HTMLElement} rootElement - Element để render component vào.
 * @param {object} params - Tham số từ URL (e.g., { id: '...' }).
 */
export async function renderPracticeSession(rootElement, params) {
    currentSetId = params.id;

    // 1. Tải CSS
    if (!document.querySelector('link[href="/practice.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/practice.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML
    const response = await fetch('/practice.html');
    if (!response.ok) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Error loading practice session.</p>`;
        return;
    }
    const html = await response.text();
    rootElement.innerHTML = html;

    // 3. Lấy dữ liệu từ
    const { data, error } = await dbService.getWordsInSet(currentSetId);
    if (error || data.length === 0) {
        alert("This set has no words to practice. Please add some words first.");
        window.location.hash = `#/set/${currentSetId}`; // Quay lại trang chi tiết
        return;
    }
    // Flatten the structure and shuffle for a new experience each time
    practiceWords = data.map(item => item.word_senses).filter(Boolean);
    shuffleArray(practiceWords);

    // 4. Thiết lập event listeners và bắt đầu phiên học
    setupPracticeEventListeners();
    startSession();
}

/**
 * Caches DOM elements and sets up event listeners for the practice session.
 */
function setupPracticeEventListeners() {
    const exitBtn = document.getElementById('exit-practice-btn');
    exitBtn.href = `#/set/${currentSetId}`; // Đặt link thoát chính xác

    // Cache DOM elements
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

    // Attach events
    flipBtn.addEventListener('click', handleFlip);
    typingInput.addEventListener('keydown', handleTyping);
}

/**
 * Starts or resets the practice session.
 */
function startSession() {
    currentWordIndex = 0;
    loadWord(currentWordIndex);
}

/**
 * Loads a word into the practice view.
 * @param {number} index - The index of the word to load from `practiceWords`.
 */
function loadWord(index) {
    if (index >= practiceWords.length) {
        showCompletionScreen();
        return;
    }

    const wordData = practiceWords[index];

    // --- Reset and setup Flashcard View ---
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
        <div style="font-style: italic; color: var(--text-secondary); margin-top: 1rem;">"${wordData.example || 'No example'}"</div>
    `;
    // Attach event listener to the newly created button
    document.getElementById('flashcard-audio-btn').addEventListener('click', () => {
        ttsService.speak(wordData.words.word);
    });

    // --- Reset and setup Typing View ---
    typingMeaning.textContent = wordData.meaning;
    typingInput.value = '';
    typingAudioBtn.onclick = () => ttsService.speak(wordData.words.word);

    typingInput.classList.remove('wrong');
    hintArea.textContent = '';
    wrongAttempts = 0; // Reset for the new word

    // --- Update Progress ---
    updateProgress();
}

/**
 * Handles the flip button click, transitioning from Flashcard to Typing view.
 */
function handleFlip() {
    flashcard.classList.add('flipped');

    // Wait for the flip animation to complete before switching views
    setTimeout(() => {
        flashcardView.classList.add('hidden');
        typingView.classList.remove('hidden');
        typingInput.focus();
    }, 600); // This duration should match the CSS transition duration
}

/**
 * Handles the keydown event in the typing input.
 * @param {KeyboardEvent} event 
 */
function handleTyping(event) {
    typingInput.classList.remove('wrong');
    if (event.key !== 'Enter') return;
    
    const userAnswer = typingInput.value.trim().toLowerCase();
    const correctAnswer = practiceWords[currentWordIndex].words.word.trim().toLowerCase();

    if (userAnswer === correctAnswer) {
        ttsService.speak(correctAnswer); // Auditory reinforcement
        // Record the result for this word
        sessionResults.push({
            word_sense_id: practiceWords[currentWordIndex].id,
            wrongAttempts: wrongAttempts,
        });
        currentWordIndex++;
        loadWord(currentWordIndex);
    } else {
        typingInput.classList.add('wrong');
        wrongAttempts++;
        showHint(correctAnswer);
    }
}

/**
 * Displays a hint based on the number of wrong attempts.
 * @param {string} correctAnswer The correct word.
 */
function showHint(correctAnswer) {
    let hint = '';
    const vowels = 'aeiou';

    switch (wrongAttempts) {
        case 1: // Hint Level 1: Show first letter
            hint = correctAnswer[0] + ' _'.repeat(correctAnswer.length - 1);
            break;
        case 2: // Hint Level 2: Show first and last letter
            hint = correctAnswer.length > 1
                ? correctAnswer[0] + ' _'.repeat(correctAnswer.length - 2) + ' ' + correctAnswer.slice(-1)
                : correctAnswer[0];
            break;
        case 3: // Hint Level 3: Show vowels
            hint = correctAnswer.split('').map(char => vowels.includes(char.toLowerCase()) ? char : '_').join(' ');
            break;
        default: // 4+ attempts: Show the full answer
            hint = `Answer: ${correctAnswer}`;
            break;
    }
    hintArea.textContent = hint;
}

/**
 * Updates the progress bar and text.
 */
function updateProgress() {
    const progress = (currentWordIndex / practiceWords.length) * 100;
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${currentWordIndex}/${practiceWords.length}`;
}

/**
 * Shows the completion screen and saves the session progress.
 */
async function showCompletionScreen() {
    // Save progress before showing the completion message
    await saveSessionProgress();

    document.getElementById('practice-main').innerHTML = `
        <div style="text-align: center;">
            <h1>Congratulations!</h1>
            <p>You have completed this practice session.</p>
            <p>Your progress has been saved.</p>
            <a href="#/set/${currentSetId}" class="btn-primary" style="text-decoration: none; margin-top: 2rem; display: inline-block;">Back to Set</a>
        </div>
    `;
    progressBar.style.width = '100%';
    progressText.textContent = `${practiceWords.length}/${practiceWords.length}`;
}

/**
 * Calculates and saves the user's progress for the completed session.
 */
async function saveSessionProgress() {
    const { data: { user } } = await authService.getUser();
    if (!user || sessionResults.length === 0) return;

    // For simplicity, we'll fetch current progress for all words at once.
    // In a larger app, this could be optimized.
    const wordSenseIds = sessionResults.map(r => r.word_sense_id);
    const { data: currentProgressList } = await supabase
        .from('user_progress')
        .select('word_sense_id, mastery_level')
        .in('word_sense_id', wordSenseIds)
        .eq('user_id', user.id);

    const currentProgressMap = new Map(currentProgressList.map(p => [p.word_sense_id, p.mastery_level]));

    const progressUpdates = sessionResults.map(result => {
        const currentMastery = currentProgressMap.get(result.word_sense_id) || 0;
        let newMastery;

        if (result.wrongAttempts === 0) {
            // Correct on first try -> increase mastery
            newMastery = Math.min(currentMastery + 1, 5);
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

    const { error } = await dbService.updateUserProgress(progressUpdates);
    if (error) {
        console.error("Failed to save progress:", error);
        // Optionally, inform the user that progress saving failed.
    }
}