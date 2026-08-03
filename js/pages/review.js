document.addEventListener('DOMContentLoaded', () => {
    const cards = [
        { word: 'Astonish', pronunciation: '/əˈstɒnɪʃ/', meaning: 'Làm ngạc nhiên', example: "The magician's tricks will astonish you.", pos: 'Verb' },
        { word: 'Ubiquitous', pronunciation: '/juːˈbɪkwɪtəs/', meaning: 'Phổ biến, ở đâu cũng có', example: 'Coffee shops are ubiquitous in the city.', pos: 'Adjective' },
        { word: 'Implement', pronunciation: '/ˈɪmplɪment/', meaning: 'Triển khai', example: 'We will implement the new system next week.', pos: 'Verb' },
        { word: 'Revenue', pronunciation: '/ˈrevənjuː/', meaning: 'Doanh thu', example: 'The company reported record revenue.', pos: 'Noun' },
        { word: 'Negotiate', pronunciation: '/nɪˈɡəʊʃieɪt/', meaning: 'Đàm phán', example: 'We need to negotiate a better deal.', pos: 'Verb' },
        { word: 'Algorithm', pronunciation: '/ˈælɡərɪðəm/', meaning: 'Thuật toán', example: 'This algorithm sorts data efficiently.', pos: 'Noun' },
        { word: 'Develop', pronunciation: '/dɪˈveləp/', meaning: 'Phát triển', example: 'The company plans to develop new software.', pos: 'Verb' },
        { word: 'Sustainable', pronunciation: '/səˈsteɪnəbl/', meaning: 'Bền vững', example: 'We need sustainable growth.', pos: 'Adjective' },
        { word: 'Stakeholder', pronunciation: '/ˈsteɪkhəʊldə/', meaning: 'Bên liên quan', example: 'All stakeholders approved the plan.', pos: 'Noun' },
        { word: 'Serendipity', pronunciation: '/ˌserənˈdɪpəti/', meaning: 'Sự tình cờ may mắn', example: 'Finding that book was pure serendipity.', pos: 'Noun' }
    ];
    const get = (id) => document.getElementById(id);
    const flashcard = get('review-flashcard');
    const revealButton = get('review-check-btn');
    const difficultyActions = get('difficulty-actions');
    const session = get('review-session');
    const emptyState = document.querySelector('.review-empty-state');
    const state = { index: 0, revealed: false, correct: 0, again: 0 };
    const render = () => {
        const card = cards[state.index];
        get('review-prompt-word').textContent = card.word;
        get('review-pronunciation').textContent = card.pronunciation;
        get('review-prompt-label').textContent = card.pos;
        get('review-meaning').textContent = card.meaning;
        get('review-ipa').textContent = card.pronunciation;
        get('review-example').textContent = `“${card.example}”`;
        get('review-card-count').textContent = `Card ${state.index + 1} of ${cards.length}`;
        get('review-remaining').textContent = cards.length - state.index;
        get('session-percent').textContent = `${Math.round((state.index / cards.length) * 100)}% complete`;
        get('review-progress').style.width = `${(state.index / cards.length) * 100}%`;
        flashcard.classList.remove('flipped');
        difficultyActions.hidden = true;
        revealButton.hidden = false;
        state.revealed = false;
    };
    const reveal = () => {
        if (state.revealed) return;
        flashcard.classList.add('flipped');
        difficultyActions.hidden = false;
        revealButton.hidden = true;
        state.revealed = true;
    };
    const rate = (rating) => {
        if (rating === 'again') state.again += 1; else state.correct += 1;
        get('review-correct').textContent = state.correct;
        get('review-incorrect').textContent = state.again;
        state.index += 1;
        if (state.index === cards.length) {
            session.hidden = true;
            emptyState.hidden = false;
            get('review-progress').style.width = '100%';
            get('session-percent').textContent = '100% complete';
            return;
        }
        render();
    };
    flashcard.addEventListener('click', reveal);
    flashcard.addEventListener('keydown', (event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); reveal(); } });
    revealButton.addEventListener('click', reveal);
    get('start-review-btn').addEventListener('click', () => {
        if (session.hidden) {
            state.index = 0;
            state.revealed = false;
            session.hidden = false;
            emptyState.hidden = true;
            render();
        }
        flashcard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashcard.focus({ preventScroll: true });
    });
    difficultyActions.addEventListener('click', (event) => { const button = event.target.closest('[data-rating]'); if (button) rate(button.dataset.rating); });
    get('audio-btn').addEventListener('click', (event) => { event.stopPropagation(); if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(cards[state.index].word)); } });
    render();
});
