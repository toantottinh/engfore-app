document.addEventListener('DOMContentLoaded', () => {
    // --- DUMMY DATA ---
    const words = [
        { id: 1, word: 'Astonish', pronunciation: '/əˈstɒnɪʃ/', meaning: 'Làm ngạc nhiên', partOfSpeech: 'Verb', example: 'The magicians tricks will astonish you.', category: 'Emotions', difficulty: 'Medium', favorite: true, dateAdded: '2026-07-28' },
        { id: 2, word: 'Ubiquitous', pronunciation: '/juːˈbɪkwɪtəs/', meaning: 'Phổ biến, ở đâu cũng có', partOfSpeech: 'Adjective', example: 'Coffee shops are ubiquitous in the city.', category: 'Technology', difficulty: 'Hard', favorite: false, dateAdded: '2026-07-27' },
        { id: 3, word: 'Serendipity', pronunciation: '/ˌserənˈdɪpəti/', meaning: 'Sự tình cờ may mắn', partOfSpeech: 'Noun', example: 'Finding a forgotten twenty-dollar bill was a moment of serendipity.', category: 'Concepts', difficulty: 'Hard', favorite: true, dateAdded: '2026-07-26' },
        { id: 4, word: 'Develop', pronunciation: '/dɪˈveləp/', meaning: 'Phát triển', partOfSpeech: 'Verb', example: 'The company plans to develop new software.', category: 'Business', difficulty: 'Easy', favorite: false, dateAdded: '2026-07-25' },
    ];

    // --- DOM ELEMENTS ---
    const vocabularyList = document.getElementById('vocabulary-list');
    const emptyState = document.getElementById('empty-state');
    const addWordBtn = document.getElementById('add-word-btn');
    const emptyAddWordBtn = document.getElementById('empty-add-word-btn');
    const wordModal = document.getElementById('word-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const wordForm = document.getElementById('word-form');
    const modalTitle = document.getElementById('modal-title');

    // Filter & Sort Elements
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const difficultyFilter = document.getElementById('difficulty-filter');
    const favoriteFilter = document.getElementById('favorite-filter');
    const sortBy = document.getElementById('sort-by');

    // --- STATE ---
    let currentWords = [...words];

    // --- FUNCTIONS ---

    const renderWords = () => {
        vocabularyList.innerHTML = '';

        if (currentWords.length === 0) {
            emptyState.style.display = 'block';
            vocabularyList.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        vocabularyList.style.display = 'grid';

        currentWords.forEach(word => {
            const card = document.createElement('article');
            card.className = 'word-card card';
            card.innerHTML = `
                <div class="card-body">
                    <div class="word-card-header">
                        <div>
                            <h3 class="word-card-title">${word.word}</h3>
                            <p class="word-card-pronunciation">${word.pronunciation}</p>
                        </div>
                        <div class="word-card-actions">
                            <button class="btn-icon-only btn-secondary favorite-btn" data-id="${word.id}">
                                <i class="icon" data-lucide="star" style="${word.favorite ? 'fill: var(--status-warning); color: var(--status-warning);' : ''}"></i>
                            </button>
                        </div>
                    </div>
                    <p class="word-card-meaning">${word.meaning}</p>
                    <p class="word-card-example">“${word.example}”</p>
                    <div class="word-card-footer">
                        <div class="word-card-meta">
                            <span class="badge badge-success">${word.difficulty}</span>
                            <span class="badge badge-warning">${word.category}</span>
                        </div>
                        <div class="word-card-actions">
                            <button class="btn-icon-only btn-secondary edit-btn" data-id="${word.id}"><i class="icon" data-lucide="edit-2"></i></button>
                            <button class="btn-icon-only btn-secondary delete-btn" data-id="${word.id}"><i class="icon" data-lucide="trash-2"></i></button>
                        </div>
                    </div>
                </div>
            `;
            vocabularyList.appendChild(card);
        });
        lucide.createIcons(); // Re-initialize icons
    };

    const applyFiltersAndSort = () => {
        let filteredWords = [...words];

        // Search
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            filteredWords = filteredWords.filter(w => w.word.toLowerCase().includes(searchTerm) || w.meaning.toLowerCase().includes(searchTerm));
        }

        // Filters
        if (categoryFilter.value !== 'all') {
            filteredWords = filteredWords.filter(w => w.category === categoryFilter.value);
        }
        if (difficultyFilter.value !== 'all') {
            filteredWords = filteredWords.filter(w => w.difficulty.toLowerCase() === difficultyFilter.value);
        }
        if (favoriteFilter.value === 'favorites') {
            filteredWords = filteredWords.filter(w => w.favorite);
        }

        // Sort
        switch (sortBy.value) {
            case 'oldest':
                filteredWords.sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
                break;
            case 'alphabetical':
                filteredWords.sort((a, b) => a.word.localeCompare(b.word));
                break;
            case 'newest':
            default:
                filteredWords.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
                break;
        }

        currentWords = filteredWords;
        renderWords();
    };

    const populateFilters = () => {
        const categories = [...new Set(words.map(w => w.category))];
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            categoryFilter.appendChild(option);
        });
    };

    const openModal = (word = null) => {
        wordForm.reset();
        if (word) {
            modalTitle.textContent = 'Edit Word';
            document.getElementById('word-id').value = word.id;
            document.getElementById('word').value = word.word;
            document.getElementById('pronunciation').value = word.pronunciation;
            document.getElementById('meaning').value = word.meaning;
            document.getElementById('example').value = word.example;
            document.getElementById('part-of-speech').value = word.partOfSpeech;
            document.getElementById('category').value = word.category;
            document.getElementById('difficulty').value = word.difficulty;
        } else {
            modalTitle.textContent = 'Add New Word';
            document.getElementById('word-id').value = '';
        }
        wordModal.style.display = 'flex';
    };

    const closeModal = () => {
        wordModal.style.display = 'none';
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('word-id').value;
        const newWord = {
            id: id ? parseInt(id) : Date.now(),
            word: document.getElementById('word').value,
            pronunciation: document.getElementById('pronunciation').value,
            meaning: document.getElementById('meaning').value,
            example: document.getElementById('example').value,
            partOfSpeech: document.getElementById('part-of-speech').value,
            category: document.getElementById('category').value,
            difficulty: document.getElementById('difficulty').value,
            favorite: id ? words.find(w => w.id === parseInt(id)).favorite : false,
            dateAdded: id ? words.find(w => w.id === parseInt(id)).dateAdded : new Date().toISOString().split('T')[0],
        };

        if (id) {
            // Edit
            const index = words.findIndex(w => w.id === parseInt(id));
            words[index] = newWord;
        } else {
            // Add
            words.push(newWord);
        }
        closeModal();
        applyFiltersAndSort();
        populateFilters(); // Repopulate in case of new category
    };

    const handleListClick = (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const id = parseInt(target.dataset.id);

        if (target.classList.contains('favorite-btn')) {
            const word = words.find(w => w.id === id);
            word.favorite = !word.favorite;
            applyFiltersAndSort();
        }

        if (target.classList.contains('edit-btn')) {
            const word = words.find(w => w.id === id);
            openModal(word);
        }

        if (target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this word?')) {
                const index = words.findIndex(w => w.id === id);
                words.splice(index, 1);
                applyFiltersAndSort();
            }
        }
    };

    // --- EVENT LISTENERS ---
    addWordBtn.addEventListener('click', () => openModal());
    emptyAddWordBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    wordModal.addEventListener('click', (e) => {
        if (e.target === wordModal) closeModal();
    });
    wordForm.addEventListener('submit', handleFormSubmit);
    vocabularyList.addEventListener('click', handleListClick);

    // Filters
    searchInput.addEventListener('input', applyFiltersAndSort);
    categoryFilter.addEventListener('change', applyFiltersAndSort);
    difficultyFilter.addEventListener('change', applyFiltersAndSort);
    favoriteFilter.addEventListener('change', applyFiltersAndSort);
    sortBy.addEventListener('change', applyFiltersAndSort);

    // --- GLOBAL SEARCH (from topbar) ---
    document.addEventListener('vocabulary-search', (e) => {
        const query = e.detail;
        if (searchInput) {
            searchInput.value = query;
            applyFiltersAndSort();
            searchInput.focus();
        }
    });

    // --- INITIALIZATION ---
    populateFilters();
    applyFiltersAndSort();
});
