import { ttsService } from '/tts.service.js';
import { shortcutService } from '/shortcut.service.js';

let wordData, onComplete;

// DOM element references
let flashcard, flashcardFront, flashcardBack, nextBtn;

async function init(data, onCompleteCallback) {
    wordData = data;
    onComplete = onCompleteCallback;

    // 1. Tải CSS
    if (!document.querySelector('link[href="/gamemodes/flashcard/style.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/gamemodes/flashcard/style.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML
    const response = await fetch('/gamemodes/flashcard/template.html');
    return await response.text();
}

function setup(container) {
    flashcard = container.querySelector('#flashcard');
    flashcardFront = container.querySelector('#flashcard-front');
    flashcardBack = container.querySelector('#flashcard-back');
    nextBtn = container.querySelector('#next-btn');

    // Load data into UI
    flashcardFront.textContent = wordData.meaning;
    flashcardBack.innerHTML = `
        <div class="word-and-audio">
            <span>${wordData.words.word}</span>
            <button id="flashcard-audio-btn" class="audio-btn" title="Listen" aria-label="Listen to the word ${wordData.words.word}">🔊</button>
        </div>
        <div>/${wordData.words.ipa || '...'}/</div>
        <div style="font-style: italic; color: var(--text-secondary); margin-top: 1rem;">"${wordData.example || 'No example'}"</div>
    `;

    // Attach events
    flashcard.addEventListener('click', handleFlip);
    nextBtn.addEventListener('click', handleNext);
    flashcardBack.querySelector('#flashcard-audio-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Ngăn việc lật lại thẻ khi bấm nút audio
        ttsService.speak(wordData.words.word);
    });

    // Register shortcuts
    shortcutService.registerAction('flipCard', handleFlip);
    shortcutService.registerAction('submitAnswer', handleNext); // Dùng phím Enter để qua từ mới
}

function handleFlip() {
    if (flashcard.classList.contains('flipped')) return;

    flashcard.classList.add('flipped');
    nextBtn.classList.remove('hidden');
    ttsService.speak(wordData.words.word);
}

function handleNext() {
    // Flashcard là chế độ ôn tập thụ động, không tính điểm sai
    onComplete({ wrongAttempts: 0 });
}

function cleanup() {
    shortcutService.unregisterAction('flipCard');
    shortcutService.unregisterAction('submitAnswer');
    console.log('Cleaning up Flashcard game mode.');
}

export const flashcardGameMode = {
    name: 'flashcard',
    init,
    setup,
    cleanup
};