document.addEventListener('DOMContentLoaded', () => {
    // --- DUMMY DATA ---
    const decks = {
        'IT Vocabulary': [
            { word: 'Astonish', pronunciation: '/əˈstɒnɪʃ/', meaning: 'Làm ngạc nhiên', example: 'The magician\'s tricks will astonish you.', pos: 'Verb' },
            { word: 'Ubiquitous', pronunciation: '/juːˈbɪkwɪtəs/', meaning: 'Phổ biến, ở đâu cũng có', example: 'Coffee shops are ubiquitous in the city.', pos: 'Adjective' },
            { word: 'Develop', pronunciation: '/dɪˈveləp/', meaning: 'Phát triển', example: 'The company plans to develop new software.', pos: 'Verb' },
            { word: 'Algorithm', pronunciation: '/ˈælɡərɪðəm/', meaning: 'Thuật toán', example: 'This algorithm sorts data efficiently.', pos: 'Noun' },
            { word: 'Implement', pronunciation: '/ˈɪmplɪment/', meaning: 'Triển khai', example: 'We will implement the new system next week.', pos: 'Verb' },
        ],
        'Business English': [
            { word: 'Revenue', pronunciation: '/ˈrevənjuː/', meaning: 'Doanh thu', example: 'The company reported record revenue.', pos: 'Noun' },
            { word: 'Negotiate', pronunciation: '/nɪˈɡəʊʃieɪt/', meaning: 'Đàm phán', example: 'We need to negotiate a better deal.', pos: 'Verb' },
            { word: 'Stakeholder', pronunciation: '/ˈsteɪkhəʊldə/', meaning: 'Bên liên quan', example: 'All stakeholders approved the plan.', pos: 'Noun' },
            { word: 'Sustainable', pronunciation: '/səˈsteɪnəbl/', meaning: 'Bền vững', example: 'We need sustainable growth.', pos: 'Adjective' },
        ],
        'Emotions': [
            { word: 'Serendipity', pronunciation: '/ˌserənˈdɪpəti/', meaning: 'Sự tình cờ may mắn', example: 'Finding that book was pure serendipity.', pos: 'Noun' },
            { word: 'Euphoria', pronunciation: '/juːˈfɔːriə/', meaning: 'Sự hưng phấn', example: 'Winning the match filled them with euphoria.', pos: 'Noun' },
            { word: 'Melancholy', pronunciation: '/ˈmelənkəli/', meaning: 'Sự u sầu', example: 'A sense of melancholy filled the room.', pos: 'Noun' },
        ],
    };

    // --- DOM ELEMENTS ---
    const deckSelect = document.getElementById('deck-select');
    const counter = document.getElementById('flashcard-counter');
    const flashcard = document.getElementById('flashcard');
    const frontWord = document.getElementById('front-word');
    const frontPronunciation = document.getElementById('front-pronunciation');
    const frontPos = document.getElementById('front-pos');
    const backMeaning = document.getElementById('back-meaning');
    const backExample = document.getElementById('back-example');
    const prevBtn = document.getElementById('prev-card-btn');
    const nextBtn = document.getElementById('next-card-btn');
    const flipBtn = document.getElementById('flip-card-btn');

    // --- STATE ---
    let currentDeck = 'IT Vocabulary';
    let currentIndex = 0;

    const renderCard = () => {
        const cards = decks[currentDeck];
        if (!cards || cards.length === 0) return;

        const card = cards[currentIndex];
        frontWord.textContent = card.word;
        frontPronunciation.textContent = card.pronunciation;
        frontPos.textContent = card.pos;
        backMeaning.textContent = card.meaning;
        backExample.textContent = `"${card.example}"`;

        counter.textContent = `Card ${currentIndex + 1} of ${cards.length}`;
        flashcard.classList.remove('flipped');
    };

    const flipCard = () => {
        flashcard.classList.toggle('flipped');
    };

    const goNext = () => {
        const cards = decks[currentDeck];
        currentIndex = (currentIndex + 1) % cards.length;
        renderCard();
    };

    const goPrev = () => {
        const cards = decks[currentDeck];
        currentIndex = (currentIndex - 1 + cards.length) % cards.length;
        renderCard();
    };

    // --- EVENT LISTENERS ---
    flashcard.addEventListener('click', flipCard);
    flipBtn.addEventListener('click', flipCard);
    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);

    deckSelect.addEventListener('change', (e) => {
        currentDeck = e.target.value;
        currentIndex = 0;
        renderCard();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowRight') goNext();
        if (e.key === 'ArrowLeft') goPrev();
        if (e.key === ' ') { e.preventDefault(); flipCard(); }
    });

    // --- INITIALIZATION ---
    renderCard();
});

