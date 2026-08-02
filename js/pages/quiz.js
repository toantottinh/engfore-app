document.addEventListener('DOMContentLoaded', () => {
    // --- DUMMY QUIZ QUESTIONS ---
    const questions = [
        { question: 'If I _____ time, I would travel more.', options: ['have', 'had', 'would have', 'will have'], answer: 1 },
        { question: 'If it _____ tomorrow, we will cancel the picnic.', options: ['rains', 'rained', 'will rain', 'would rain'], answer: 0 },
        { question: 'She would have passed the exam if she _____ harder.', options: ['studies', 'studied', 'had studied', 'would study'], answer: 2 },
        { question: 'If I were you, I _____ that job offer.', options: ['accept', 'accepted', 'would accept', 'will accept'], answer: 2 },
        { question: 'What would you do if you _____ a million dollars?', options: ['win', 'won', 'would win', 'had won'], answer: 1 },
        { question: 'If she arrives early, we _____ the meeting on time.', options: ['start', 'would start', 'started', 'had started'], answer: 0 },
        { question: 'He would feel better if he _____ more sleep.', options: ['gets', 'got', 'would get', 'will get'], answer: 1 },
        { question: 'If they had known about the sale, they _____ more items.', options: ['buy', 'bought', 'would have bought', 'will buy'], answer: 2 },
        { question: 'I would call you if I _____ your number.', options: ['have', 'had', 'would have', 'will have'], answer: 1 },
        { question: 'If you heat water to 100°C, it _____.', options: ['boils', 'boiled', 'would boil', 'will boil'], answer: 0 },
    ];

    // --- DOM ELEMENTS ---
    const quizContainer = document.querySelector('.quiz-container');
    const questionNumber = document.getElementById('quiz-question-number');
    const questionText = document.getElementById('quiz-question-text');
    const optionsEl = document.getElementById('quiz-options');
    const progressText = document.getElementById('quiz-progress-text');
    const progressBar = document.getElementById('quiz-progress-bar');
    const prevBtn = document.getElementById('quiz-prev-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    // --- STATE ---
    let currentIndex = 0;
    let answers = new Array(questions.length).fill(null);

    const renderQuestion = () => {
        const q = questions[currentIndex];
        questionNumber.textContent = `Question ${currentIndex + 1}`;
        questionText.textContent = q.question;
        progressText.innerHTML = `<span>Question ${currentIndex + 1} of ${questions.length}</span><span>${Math.round(((currentIndex) / questions.length) * 100)}%</span>`;
        progressBar.style.width = `${((currentIndex) / questions.length) * 100}%`;

        optionsEl.innerHTML = '';
        q.options.forEach((opt, i) => {
            const label = document.createElement('label');
            label.className = 'quiz-option';
            if (answers[currentIndex] === i) label.classList.add('selected');
            label.innerHTML = `<span class="option-letter">${String.fromCharCode(65 + i)}</span><span class="option-text">${opt}</span>`;
            label.addEventListener('click', () => selectOption(i, label));
            optionsEl.appendChild(label);
        });

        prevBtn.disabled = currentIndex === 0;
        nextBtn.textContent = currentIndex === questions.length - 1 ? 'Submit' : 'Next';
    };

    const selectOption = (index, el) => {
        answers[currentIndex] = index;
        optionsEl.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
    };

    const showResults = () => {
        const correct = answers.filter((a, i) => a === questions[i].answer).length;
        const score = Math.round((correct / questions.length) * 100);
        const wrong = questions.length - correct;

        let icon = 'award';
        if (score >= 90) icon = 'trophy';
        else if (score >= 70) icon = 'award';
        else if (score >= 50) icon = 'target';
        else icon = 'book-open';

        quizContainer.innerHTML = `
            <div class="quiz-results">
                <i class="icon" data-lucide="${icon}" style="width: 64px; height: 64px; color: var(--brand-primary);"></i>
                <p class="result-score">${score}%</p>
                <p class="result-label">${score >= 90 ? 'Outstanding! You mastered this topic.' : score >= 70 ? 'Great job! Keep practicing.' : score >= 50 ? 'Good effort. Review the material and try again.' : 'Keep studying. You will get better!'}</p>
                <div class="result-details">
                    <div class="result-stat"><p class="result-stat-value" style="color: var(--status-success);">${correct}</p><p class="result-stat-label">Correct</p></div>
                    <div class="result-stat"><p class="result-stat-value" style="color: var(--status-error);">${wrong}</p><p class="result-stat-label">Incorrect</p></div>
                    <div class="result-stat"><p class="result-stat-value">${questions.length}</p><p class="result-stat-label">Total</p></div>
                </div>
                <button class="btn btn-primary" id="quiz-retry-btn"><i class="icon" data-lucide="rotate-ccw"></i> Retry Quiz</button>
            </div>
        `;
        lucide.createIcons();

        document.getElementById('quiz-retry-btn').addEventListener('click', () => window.location.reload());

        if (typeof window.showToast === 'function') {
            window.showToast(`Quiz complete! Score: ${score}%`, score >= 70 ? 'success' : 'error');
        }
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            currentIndex++;
            renderQuestion();
        } else {
            showResults();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            currentIndex--;
            renderQuestion();
        }
    };

    // --- EVENT LISTENERS ---
    nextBtn.addEventListener('click', handleNext);
    prevBtn.addEventListener('click', handlePrev);

    // --- INITIALIZATION ---
    renderQuestion();
});

