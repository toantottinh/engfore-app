import { ttsService } from '/tts.service.js';

let wordData, onComplete;
let wrongAttempts = 0;

// DOM element references
let audioBtn, input, hintArea;

async function init(data, onCompleteCallback) {
    wordData = data;
    onComplete = onCompleteCallback;
    wrongAttempts = 0;

    // 1. Tải CSS
    if (!document.querySelector('link[href="/gamemodes/listening/style.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/gamemodes/listening/style.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML
    const response = await fetch('/gamemodes/listening/template.html');
    return await response.text();
}

function setup(container) {
    audioBtn = container.querySelector('#listening-audio-btn');
    input = container.querySelector('#listening-input');
    hintArea = container.querySelector('#listening-hint-area');

    audioBtn.addEventListener('click', () => ttsService.speak(wordData.words.word));
    input.addEventListener('keydown', handleTyping);

    // Play the sound for the first time
    setTimeout(() => ttsService.speak(wordData.words.word), 300);
    input.focus();
}

function handleTyping(event) {
    input.classList.remove('wrong');
    if (event.key !== 'Enter') return;

    const userAnswer = input.value.trim().toLowerCase();
    const correctAnswer = wordData.words.word.trim().toLowerCase();

    if (userAnswer === correctAnswer) {
        // Play sound again as positive reinforcement
        ttsService.speak(correctAnswer);
        onComplete({ wrongAttempts });
    } else {
        input.classList.add('wrong');
        wrongAttempts++;
        showHint(correctAnswer);
    }
}

function showHint(correctAnswer) {
    let hint = '';
    const vowels = 'aeiou';
    switch (wrongAttempts) {
        case 1:
            hint = '_ '.repeat(correctAnswer.length);
            break;
        case 2:
            hint = correctAnswer[0] + ' _'.repeat(correctAnswer.length - 1);
            break;
        case 3:
            hint = correctAnswer.split('').map(char => vowels.includes(char.toLowerCase()) ? char : '_').join(' ');
            break;
        default:
            hint = `Answer: ${correctAnswer}`;
            break;
    }
    hintArea.textContent = hint;
}

function cleanup() {
    if (audioBtn) audioBtn.removeEventListener('click', ttsService.speak);
    if (input) input.removeEventListener('keydown', handleTyping);
    console.log('Cleaning up Listening game mode.');
}

export const listeningGameMode = {
    name: 'listening',
    init,
    setup,
    cleanup
};