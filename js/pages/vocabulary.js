// NOTE: In a real project, this would be in a separate, shared file.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const SUPABASE_URL = 'https://ivwstfnyoardfglstzfl.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2d3N0Zm55b2FyZGZnbHN0emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk0NzY0MTAsImV4cCI6MjAzNTA1MjQxMH0.4M2v3hM714f1v-b3i5oYm1f4f29dJkL5V79x-vR22hY'; // Replace with your Supabase anon key (public key)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ELEMENTS ---
    const libraryView = document.getElementById('library-view');
    const setDetailView = document.getElementById('set-detail-view');

    // Library View Elements
    const setsGrid = document.getElementById('sets-grid');
    const emptyState = document.getElementById('empty-state');
    const searchInput = document.getElementById('search-sets-input');
    const sortSelect = document.getElementById('sort-sets-select');
    const addVocabularyBtn = document.getElementById('add-vocabulary-btn');
    const emptyAddVocabularyBtn = document.getElementById('empty-new-set-button'); // Renamed in HTML

    // Create Set Modal Elements
    const createSetModal = document.getElementById('create-set-modal');
    const closeCreateSetModalBtn = document.getElementById('close-create-set-modal-btn');
    const createSetForm = document.getElementById('create-set-form');
    const setNameInput = document.getElementById('set-name-input');
    const setDescriptionInput = document.getElementById('set-description-input');
    const createSetBtn = document.getElementById('create-set-btn');
    const cancelCreateSetBtn = document.getElementById('cancel-create-set-btn');
    const setNameError = document.getElementById('set-name-error');
    const setDescriptionError = document.getElementById('set-description-error');
    const createSetBtnText = createSetBtn.querySelector('.btn-text');
    const createSetSpinner = createSetBtn.querySelector('.spinner');

    // Set Detail View Elements
    const backToLibraryButton = document.getElementById('back-to-library-button');
    const setDetailTitle = document.getElementById('set-detail-title');
    const setDetailDescription = document.getElementById('set-detail-description');
    const setStatsGrid = document.getElementById('set-stats-grid');
    const wordListContainer = document.getElementById('word-list-container');
    const wordCardsGrid = document.getElementById('word-cards-grid');
    const detailEmptyState = document.getElementById('detail-empty-state');
    const addWordsAiBtn = document.getElementById('add-words-ai-btn');

    // Import Words Modal Elements
    const importWordsModal = document.getElementById('import-words-modal');
    const closeImportModalBtn = document.getElementById('close-import-modal-btn');
    const aiPromptText = document.getElementById('ai-prompt-text');
    const copyPromptBtn = document.getElementById('copy-prompt-btn'); // Corrected ID
    const importContinue1 = document.getElementById('import-continue-1');
    const importBack2 = document.getElementById('import-back-2');
    const pasteTextarea = document.getElementById('paste-textarea');
    const previewWordsBtn = document.getElementById('preview-words-btn');
    const importPreviewContainer = document.getElementById('import-preview-container');
    const previewSummary = document.getElementById('preview-summary');
    const previewList = document.getElementById('preview-list');

    // --- STATE ---
    let currentSetId = null;

    // --- DATA FETCHING & RENDERING ---
    const fetchAndRenderSets = async () => {
        const searchTerm = searchInput.value.trim();
        const sortBy = sortSelect.value;

        let query = supabase
            .from('vocabulary_sets')
            .select(`
                id,
                name,
                description,
                created_at,
                updated_at,
                set_words(count) // For Word Count
            `, { count: 'exact' });

        // Search
        if (searchTerm) {
            query = query.ilike('name', `%${searchTerm}%`);
        }

        // Sort
        switch (sortBy) {
            case 'oldest':
                query = query.order('created_at', { ascending: true });
                break;
            case 'name_asc':
                query = query.order('name', { ascending: true });
                break;
            case 'last_studied':
                query = query.order('updated_at', { ascending: false });
                break;
            case 'newest':
            default:
                query = query.order('created_at', { ascending: false });
                break;
        }

        const { data: sets, error } = await query;

        if (error) {
            console.error('Error fetching sets:', error);
            setsGrid.innerHTML = '<p>Lỗi khi tải danh sách bộ từ.</p>';
            return;
        }

        if (sets.length === 0) {
            setsGrid.innerHTML = ''; // Clear any skeletons if no data
        }

        renderSets(sets);
    };

    const renderSets = (sets) => {
        setsGrid.innerHTML = '';

        if (!sets || sets.length === 0) {
            emptyState.style.display = 'block';
            setsGrid.style.display = 'none';
            return; // Exit if no sets
        }

        emptyState.style.display = 'none'; // Hide empty state if there are sets
        setsGrid.style.display = 'grid'; // Ensure grid is visible

        sets.forEach(set => {
            // Calculations for stats
            const wordCount = set.set_words[0]?.count || 0;

            const card = document.createElement('div');
            card.className = 'set-card card';
            card.dataset.setId = set.id;
            card.innerHTML = `
                <div class="set-card-header">
                    <div class="set-card-icon">
                        <i class="icon" data-lucide="folder"></i>
                    </div>
                    <div>
                        <h3 class="set-card-title">${set.name}</h3>
                        <p class="set-card-count">${wordCount} words</p>
                    </div>
                </div>
                <p class="set-card-description">${set.description || 'Không có mô tả.'}</p>
                <div class="progress-bar">
                    <div class="progress" style="width: 0%;"></div> <!-- Placeholder -->
                </div>
                <div class="set-card-footer">
                    <div class="set-card-footer-item">
                        <span>Độ thành thạo</span>
                        <strong>0%</strong> <!-- Placeholder for now -->
                    </div>
                    <div class="set-card-footer-item">
                        <span>Ôn hôm nay</span>
                        <strong>0</strong> <!-- Placeholder for now -->
                    </div>
                    <div class="set-card-footer-item">
                        <span>Lần học gần nhất</span>
                        <strong>${new Date(set.updated_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong>
                    </div>
                </div>
                <button class="btn-icon-only btn-secondary set-card-menu">
                    <i class="icon" data-lucide="more-horizontal"></i>
                </button>
            `;
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.set-card-menu')) {
                    switchView('detail', set.id);
                }
            });
            setsGrid.appendChild(card);
        });
        lucide.createIcons();
    };

    const renderSetDetail = async (setId) => {
        currentSetId = setId;
        const { data: set, error: setError } = await supabase
            .from('vocabulary_sets')
            .select('name, description')
            .eq('id', setId)
            .single();

        if (setError) {
            console.error('Error fetching set details:', setError);
            // Handle error display
            return;
        }

        setDetailTitle.textContent = set.name;
        setDetailDescription.textContent = set.description || 'Chưa có mô tả cho bộ từ này.';

        // Fetch words for the set
        const { data: words, error: wordsError } = await supabase
            .from('set_words')
            .select('words(id, word, word_senses(ipa, meaning, cefr))')
            .eq('set_id', setId);

        if (wordsError) {
            console.error('Error fetching words for set:', wordsError);
            // Handle error display
            return;
        }

        // Render stats (placeholders for now)
        const stats = [
            { title: 'Tổng số từ', value: words.length },
            { title: 'Độ thành thạo', value: '0%' },
            { title: 'Ôn hôm nay', value: 0 },
        ];
        setStatsGrid.innerHTML = '';
        stats.forEach(stat => {
            const card = document.createElement('div');
            card.className = 'stat-card card';
            card.innerHTML = `<div class="stat-title">${stat.title}</div><div class="stat-value">${stat.value}</div>`;
            setStatsGrid.appendChild(card);
        });

        if (words.length === 0) {
            wordListContainer.style.display = 'none';
            detailEmptyState.style.display = 'block';
        } else {
            wordListContainer.style.display = 'block';
            detailEmptyState.style.display = 'none';
            renderWordCards(words);
        }
    };

    const renderWordCards = (words) => {
        wordCardsGrid.innerHTML = '';
        words.forEach(item => {
            const wordData = item.words;
            const sense = wordData.word_senses[0] || {}; // Use first sense for now
            const card = document.createElement('div');
            card.className = 'word-card';
            card.innerHTML = `
                <div class="word-card-header">
                    <div>
                        <h3 class="word-card-word">${wordData.word}</h3>
                        <p class="word-card-ipa">${sense.ipa || ''}</p>
                    </div>
                    <span class="word-card-cefr">${sense.cefr || 'N/A'}</span>
                </div>
                <div class="word-card-field">
                    <strong>Nghĩa</strong>
                    <p>${sense.meaning || 'Chưa có'}</p>
                </div>
                <div class="word-card-field">
                    <strong>Độ thành thạo</strong>
                    <div class="progress-bar"><div class="progress" style="width: 0%;"></div></div>
                </div>
                <div class="word-card-field">
                    <strong>Lần ôn tiếp theo</strong>
                    <p>Hôm nay</p>
                </div>
            `;
            wordCardsGrid.appendChild(card);
        });
        lucide.createIcons();
    };

    // --- VIEW & MODAL MANAGEMENT ---

    const switchView = (view, setId = null) => {
        if (view === 'detail') {
            libraryView.style.display = 'none';
            setDetailView.style.display = 'block';
            if (setId) {
                renderSetDetail(setId);
            }
        } else { // 'library'
            setDetailView.style.display = 'none';
            libraryView.style.display = 'block';
            currentSetId = null;
            fetchAndRenderSets(); // Refresh library view
        }
    };

    const openCreateSetModal = () => {
        createSetModal.style.display = 'flex';
        createSetForm.reset();
        setNameError.textContent = '';
        setDescriptionError.textContent = '';
        createSetBtn.disabled = false;
        createSetBtnText.style.display = 'inline';
        createSetSpinner.style.display = 'none';
    };

    const closeCreateSetModal = () => {
        createSetModal.style.display = 'none';
    };

    const openImportModal = () => {
        importWordsModal.style.display = 'flex';
        switchImportStep(1);
        aiPromptText.textContent = `Tạo 20 từ vựng tiếng Anh cho chủ đề "${setDetailTitle.textContent}". Với mỗi từ, cung cấp: word | ipa | word type | vietnamese meaning | english example sentence | english description | cefr level. Phân tách mỗi trường bằng ký tự |.`;
    };

    const closeImportModal = () => {
        importWordsModal.style.display = 'none';
    };

    const switchImportStep = (step) => {
        document.getElementById('import-step-1').style.display = step === 1 ? 'block' : 'none';
        document.getElementById('import-step-2').style.display = step === 2 ? 'block' : 'none';
    };

    // --- FORM VALIDATION & SUBMISSION ---

    const validateCreateSetForm = () => {
        let isValid = true;
        const name = setNameInput.value.trim();
        if (!name) {
            setNameError.textContent = 'Tên bộ từ là bắt buộc.';
            isValid = false;
        } else if (name.length > 100) {
            setNameError.textContent = 'Tên bộ từ không được vượt quá 100 ký tự.';
            isValid = false;
        } else {
            setNameError.textContent = '';
        }
        const description = setDescriptionInput.value.trim();
        if (description.length > 300) {
            setDescriptionError.textContent = 'Mô tả không được vượt quá 300 ký tự.';
            isValid = false;
        } else {
            setDescriptionError.textContent = '';
        }
        return isValid;
    };

    const createVocabularySet = async (event) => {
        event.preventDefault();
        if (!validateCreateSetForm()) {
            return;
        }
        createSetBtn.disabled = true;
        createSetBtnText.style.display = 'none';
        createSetSpinner.style.display = 'inline-block';
        const name = setNameInput.value.trim();
        const description = setDescriptionInput.value.trim();
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            window.showToast('Bạn cần đăng nhập để tạo bộ từ.', 'error');
            createSetBtn.disabled = false;
            createSetBtnText.style.display = 'inline';
            createSetSpinner.style.display = 'none';
            return;
        }
        const user_id = user.id;
        const { data, error } = await supabase
            .from('vocabulary_sets')
            .insert({ user_id, name, description })
            .select('id').single();
        if (error) {
            console.error('Error creating vocabulary set:', error);
            window.showToast('Tạo bộ từ vựng thất bại. Vui lòng thử lại.', 'error');
        } else {
            window.showToast('Đã tạo bộ từ vựng thành công.', 'success');
            closeCreateSetModal();
            switchView('detail', data.id); // Navigate to the new set's detail page
        }
        createSetBtn.disabled = false;
        createSetBtnText.style.display = 'inline';
        createSetSpinner.style.display = 'none';
    };


    // --- AI IMPORT LOGIC ---

    const previewPastedWords = () => {
        const text = pasteTextarea.value.trim();
        if (!text) {
            importPreviewContainer.style.display = 'none';
            return;
        }

        const lines = text.split('\n').filter(line => line.trim() !== '');
        let validCount = 0;
        previewList.innerHTML = '';

        lines.forEach(line => {
            const parts = line.split('|');
            const isValid = parts.length === 7 && parts[0].trim() && parts[3].trim();
            if (isValid) validCount++;

            const item = document.createElement('div');
            item.className = `preview-item ${isValid ? 'is-valid' : 'is-invalid'}`;
            item.textContent = line;
            previewList.appendChild(item);
        });

        previewSummary.textContent = `Tìm thấy ${lines.length} dòng. ${validCount} dòng hợp lệ sẽ được nhập.`;
        importPreviewContainer.style.display = 'block';
    };


    // --- INITIALIZATION ---
    addVocabularyBtn.addEventListener('click', openCreateSetModal);
    emptyAddVocabularyBtn.addEventListener('click', openCreateSetModal);
    closeCreateSetModalBtn.addEventListener('click', closeCreateSetModal);
    cancelCreateSetBtn.addEventListener('click', closeCreateSetModal);
    createSetForm.addEventListener('submit', createVocabularySet);
    createSetModal.addEventListener('click', (e) => {
        if (e.target === createSetModal) {
            closeCreateSetModal();
        }
    });
    searchInput.addEventListener('input', fetchAndRenderSets);
    sortSelect.addEventListener('change', fetchAndRenderSets);

    // Detail View Listeners
    backToLibraryButton.addEventListener('click', () => switchView('library'));
    addWordsAiBtn.addEventListener('click', openImportModal);

    // Import Modal Listeners
    closeImportModalBtn.addEventListener('click', closeImportModal);
    importContinue1.addEventListener('click', () => switchImportStep(2));
    importBack2.addEventListener('click', () => switchImportStep(1));
    copyPromptBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(aiPromptText.textContent).then(() => {
            window.showToast('Đã sao chép prompt!', 'success');
        });
    });
    previewWordsBtn.addEventListener('click', previewPastedWords);

    fetchAndRenderSets();
});