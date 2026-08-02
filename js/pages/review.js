document.addEventListener('DOMContentLoaded', () => {
    // --- DUMMY REVIEW ITEMS (translate Vietnamese -> English) ---
    const items = [
        { prompt: 'Làm ngạc nhiên', answer: 'astonish', hint: '/əˈstɒnɪʃ/' },
        { prompt: 'Phổ biến, ở đâu cũng có', answer: 'ubiquitous', hint: '/juːˈbɪkwɪtəs/' },
        { prompt: 'Phát triển', answer: 'develop', hint: '/dɪˈveləp/' },
        { prompt: 'Doanh thu', answer: 'revenue', hint: '/ˈrevənjuː/' },
        { prompt: 'Đàm phán', answer: 'negotiate', hint: '/nɪˈɡəʊʃieɪt/' },
        { prompt: 'Thuật toán', answer: 'algorithm', hint: '/ˈælɡərɪðəm/' },
        { prompt: 'Triển khai', answer: 'implement', hint: '/ˈɪmplɪment/' },
        { prompt: 'Sự tình cờ may mắn', answer: 'serendipity', hint: '/ˌserənˈdɪpəti/' },
        { prompt: 'Bền vững', answer: 'sustainable', hint: '/səˈsteɪnəbl/' },
        { prompt: 'Bên liên quan', answer: 'stakeholder', hint: '/ˈsteɪkhəʊldə/' },
    ];

    // --- DOM ELEMENTS ---
    const promptLabel = document.getElementById('review-prompt-label');
    const promptWord = document.getElementById('review-prompt-word');
    const input = document.getElementById('review-input');
    const feedback = document.getElementById('review-feedback');
    const correctStat = document.getElementById('review-correct');
    const incorrectStat = document.getElementById('review-incorrect');
    const remainingStat = document.getElementById('review-remaining');
    const progressBar = document.getElementById('review-progress');
    const checkBtn = document.getElementById('review-check-btn');
    const skipBtn = document.getElementById('review-skip-btn');

    // --- STATE ---
    let currentIndex = 0;
    let correct = 0;
    let incorrect = 0;
    let answered = false;

    const renderQuestion = () => {
        const item = items[currentIndex];
        promptLabel.textContent = 'Translate to English';
        promptWord.textContent = item.prompt;
        input.value = '';
        input.classList.remove('correct', 'incorrect');
        input.disabled = false;
        answered = false;
        feedback.innerHTML = '';
        remainingStat.textContent = items.length - currentIndex;
        progressBar.style.width = `${(currentIndex / items.length) * 100}%`;
        checkBtn.textContent = 'Check';
        input.focus();
    };

    const normalize = (s) => s.trim().toLowerCase().replace(/[^a-z\s]/g, '');

    const checkAnswer = () => {
        const item = items[currentIndex];
        const userAnswer = normalize(input.value);
        const isCorrect = userAnswer === normalize(item.answer);

        if (isCorrect) {
            correct++;
            input.classList.add('correct');
            feedback.innerHTML = '<p class="review-feedback-correct">✓ Correct! Great job!</p>';
        } else {
            incorrect++;
            input.classList.add('incorrect');
            feedback.innerHTML = `<p class="review-feedback-incorrect">✗ Not quite. The answer is: <strong>${item.answer}</strong></p><p class="review-feedback-answer">${item.hint}</p>`;
        }

        input.disabled = true;
        answered = true;
        correctStat.textContent = correct;
        incorrectStat.textContent = incorrect;
        checkBtn.textContent = 'Next';

        if (currentIndex === items.length - 1) {
            checkBtn.textContent = 'Finish';
            setTimeout(() => {
                if (typeof window.showToast === 'function') {
                    const pct = Math.round((correct / items.length) * 100);
                    window.showToast(pct >= 80 ? `Session complete! ${correct}/${items.length} correct. Excellent!` : `Session complete! ${correct}/${items.length} correct.`, pct >= 60 ? 'success' : 'error');
                }
            }, 300);
        }
    };

    const nextQuestion = () => {
        if (currentIndex < items.length - 1) {
            currentIndex++;
            renderQuestion();
        } else {
            // Session complete - restart
            currentIndex = 0;
            correct = 0;
            incorrect = 0;
            renderQuestion();
            correctStat.textContent = '0';
            incorrectStat.textContent = '0';
        }
    };

    const handleSubmit = () => {
        if (!answered) {
            checkAnswer();
        } else {
            nextQuestion();
        }
    };

    const handleSkip = () => {
        if (!answered) {
            incorrect++;
            incorrectStat.textContent = incorrect;
        }
        nextQuestion();
    };

    // --- EVENT LISTENERS ---
    checkBtn.addEventListener('click', handleSubmit);
    skipBtn.addEventListener('click', handleSkip);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        }
    });

    // --- INITIALIZATION ---
    renderQuestion();
});

