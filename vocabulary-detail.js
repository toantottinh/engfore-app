import { dbService } from './db.service.js';
import { authService } from './auth.service.js';

let cleanupFunctions = []; // To store functions that clean up event listeners
let currentEditingSense = null;
let currentSet = null;
let cachedWords = []; // Bộ nhớ đệm danh sách từ
let parsedWords = [];

/* ============================================================
   RENDER CHÍNH
   ============================================================ */
export async function renderVocabularyDetail(rootElement, params) {
    // 1. Tải CSS
    const cssFiles = [
        '/vocabulary-detail.css',
        '/import-ai-modal.css',
        '/add-word-modal.css',
        '/set-stats-modal.css'
    ];
    cssFiles.forEach(href => {
        if (!document.querySelector(`link[href="${href}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        }
    });

    // 2. Tải HTML (trang chi tiết và các modal)
    const [detailResponse, importModalResponse, addModalResponse, statsModalResponse] = await Promise.all([
        fetch('/vocabulary-detail.html'),
        fetch('/import-ai-modal.html'),
        fetch('/add-word-modal.html'),
        fetch('/set-stats-modal.html')
    ]);

    if (!detailResponse.ok || !importModalResponse.ok || !addModalResponse.ok) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Không thể tải trang chi tiết bộ từ.</p>`;
        return;
    }
    const detailHtml = await detailResponse.text();
    const importModalHtml = await importModalResponse.text();
    const addModalHtml = await addModalResponse.text();
    const statsModalHtml = await statsModalResponse.text();
    rootElement.innerHTML = detailHtml;
    document.body.insertAdjacentHTML('beforeend', importModalHtml);
    document.body.insertAdjacentHTML('beforeend', addModalHtml);
    document.body.insertAdjacentHTML('beforeend', statsModalHtml);

    // 3. Lấy dữ liệu bộ từ vựng
    const { data: set, error } = await dbService.getVocabularySetById(params.id);

    if (error || !set) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Không tìm thấy bộ từ vựng yêu cầu.</p>`;
        return;
    }

    currentSet = set;
    renderSetHeader(set);

    // 4. Thiết lập event listeners và tải danh sách từ
    setupDetailEventListeners();
    await loadAndRenderWords();
}

export function cleanup() {
    cleanupFunctions.forEach(func => func());
    cleanupFunctions = [];
    // Xóa các modal đã được chèn vào body
    ['import-ai-modal', 'add-word-modal', 'set-stats-modal', 'edit-set-modal-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    currentEditingSense = null;
    currentSet = null;
    cachedWords = [];
    parsedWords = [];
}

/* ============================================================
   HEADER
   ============================================================ */
function renderSetHeader(set) {
    const nameEl = document.getElementById('set-name-heading');
    if (nameEl) nameEl.textContent = set.name;

    const descEl = document.getElementById('set-description');
    if (descEl) descEl.textContent = set.description || 'Chưa có mô tả cho bộ từ này.';

    const countEl = document.getElementById('set-word-count');
    if (countEl) countEl.textContent = `${set.word_count !== undefined ? set.word_count : (cachedWords.length || 0)} từ`;

    const dateEl = document.getElementById('set-created-date');
    if (dateEl && set.created_at) {
        dateEl.textContent = `Tạo ngày ${formatDate(set.created_at)}`;
    }
}

function formatDate(iso) {
    try {
        return new Date(iso).toLocaleDateString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    } catch (e) {
        return '';
    }
}

function escapeHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function setupDetailEventListeners() {
    // --- Nút hành động header ---
    const practiceAllBtn = document.getElementById('practice-all-btn');
    if (practiceAllBtn) {
        const h = () => { window.location.hash = `#/set/${currentSet.id}/practice`; };
        practiceAllBtn.addEventListener('click', h);
        cleanupFunctions.push(() => practiceAllBtn.removeEventListener('click', h));
    }

    // Học theo chế độ
    const flashcardBtn = document.getElementById('flashcard-btn');
    if (flashcardBtn) {
        const h = () => startPracticeMode('flashcard');
        flashcardBtn.addEventListener('click', h);
        cleanupFunctions.push(() => flashcardBtn.removeEventListener('click', h));
    }
    const typingBtn = document.getElementById('typing-btn');
    if (typingBtn) {
        const h = () => startPracticeMode('typing');
        typingBtn.addEventListener('click', h);
        cleanupFunctions.push(() => typingBtn.removeEventListener('click', h));
    }

    // Sửa bộ từ
    const editSetBtn = document.getElementById('edit-set-btn');
    if (editSetBtn) {
        const h = () => openEditSetModal();
        editSetBtn.addEventListener('click', h);
        cleanupFunctions.push(() => editSetBtn.removeEventListener('click', h));
    }

    // Xóa bộ từ
    const deleteSetBtn = document.getElementById('delete-set-btn');
    if (deleteSetBtn) {
        const h = () => handleDeleteSet();
        deleteSetBtn.addEventListener('click', h);
        cleanupFunctions.push(() => deleteSetBtn.removeEventListener('click', h));
    }

    // --- Tìm kiếm, lọc, sắp xếp ---
    const searchInput = document.getElementById('word-search-input');
    if (searchInput) {
        const h = debounce(() => renderWordList(), 250);
        searchInput.addEventListener('input', h);
        cleanupFunctions.push(() => searchInput.removeEventListener('input', h));
    }
    const filterSelect = document.getElementById('word-filter-select');
    if (filterSelect) {
        const h = () => renderWordList();
        filterSelect.addEventListener('change', h);
        cleanupFunctions.push(() => filterSelect.removeEventListener('change', h));
    }
    const sortSelect = document.getElementById('word-sort-select');
    if (sortSelect) {
        const h = () => renderWordList();
        sortSelect.addEventListener('change', h);
        cleanupFunctions.push(() => sortSelect.removeEventListener('change', h));
    }

    // --- Nút thao tác danh sách ---
    const addWordBtn = document.querySelector('.add-word-btn');
    if (addWordBtn) {
        const h = () => openAddWordModal();
        addWordBtn.addEventListener('click', h);
        cleanupFunctions.push(() => addWordBtn.removeEventListener('click', h));
    }

    // --- Import AI ---
    const importAiBtn = document.querySelector('.import-ai-btn');
    if (importAiBtn) {
        const openImportModal = setupModalCloseListeners('import-ai-modal', prepareAndShowModal);
        const h = () => openImportModal();
        importAiBtn.addEventListener('click', h);
        cleanupFunctions.push(() => importAiBtn.removeEventListener('click', h));

        const copyPromptBtn = document.getElementById('copy-prompt-btn');
        if (copyPromptBtn) {
            const ch = handleCopyPrompt;
            copyPromptBtn.addEventListener('click', ch);
            cleanupFunctions.push(() => copyPromptBtn.removeEventListener('click', ch));
        }
        const previewBtn = document.getElementById('preview-btn');
        if (previewBtn) {
            const ph = handlePreview;
            previewBtn.addEventListener('click', ph);
            cleanupFunctions.push(() => previewBtn.removeEventListener('click', ph));
        }
        const importBtn = document.getElementById('import-btn');
        if (importBtn) {
            const ih = handleImport;
            importBtn.addEventListener('click', ih);
            cleanupFunctions.push(() => importBtn.removeEventListener('click', ih));
        }
    }

    // --- Add Word Modal ---
    const addWordForm = document.getElementById('add-word-form');
    if (addWordForm) {
        const h = handleAddWordSubmit;
        addWordForm.addEventListener('submit', h);
        cleanupFunctions.push(() => addWordForm.removeEventListener('submit', h));
    }
    const cancelAddBtn = document.querySelector('#add-word-modal .modal-cancel-btn');
    if (cancelAddBtn) {
        const h = () => document.getElementById('add-word-modal').classList.add('hidden');
        cancelAddBtn.addEventListener('click', h);
        cleanupFunctions.push(() => cancelAddBtn.removeEventListener('click', h));
    }

    // --- Stats Modal ---
    const statsBtn = document.querySelector('.stats-btn');
    if (statsBtn) {
        const openStatsModal = setupModalCloseListeners('set-stats-modal', showStatsModal);
        const h = () => openStatsModal();
        statsBtn.addEventListener('click', h);
        cleanupFunctions.push(() => statsBtn.removeEventListener('click', h));
    }

    // --- Danh sách từ (event delegation) ---
    const wordList = document.getElementById('word-list');
    if (wordList) {
        const h = handleWordListClick;
        wordList.addEventListener('click', h);
        cleanupFunctions.push(() => wordList.removeEventListener('click', h));
    }
}

/* ============================================================
   TẢI VÀ RENDER DANH SÁCH TỪ
   ============================================================ */
async function loadAndRenderWords() {
    const tbody = document.getElementById('word-list');
    if (!tbody || !currentSet) return;

    tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><p class="empty-state">Đang tải danh sách từ...</p></td></tr>`;

    const { data: { user } } = await authService.getUser();
    const { data, error } = await dbService.getWordsInSetWithProgress(currentSet.id, user?.id);

    if (error) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><p class="error-state">Lỗi tải từ: ${escapeHTML(error.message)}</p></td></tr>`;
        showToast('Không thể tải danh sách từ. Vui lòng thử lại.', 'error');
        return;
    }

    cachedWords = data || [];
    // Cập nhật số lượng từ
    const countEl = document.getElementById('set-word-count');
    if (countEl) countEl.textContent = `${cachedWords.length} từ`;

    renderWordList();
}

/**
 * Render danh sách từ dựa trên trạng thái tìm kiếm, lọc, sắp xếp hiện tại.
 */
function renderWordList() {
    const tbody = document.getElementById('word-list');
    if (!tbody) return;

    const searchValue = (document.getElementById('word-search-input')?.value || '').trim().toLowerCase();
    const filterValue = document.getElementById('word-filter-select')?.value || 'all';
    const sortValue = document.getElementById('word-sort-select')?.value || 'abc-asc';

    let words = [...cachedWords];

    // --- Lọc theo trạng thái học ---
    if (filterValue === 'unseen') {
        words = words.filter(w => (w.mastery_level ?? 0) === 0);
    } else if (filterValue === 'learning') {
        words = words.filter(w => (w.mastery_level ?? 0) >= 1 && (w.mastery_level ?? 0) < 5);
    } else if (filterValue === 'mastered') {
        words = words.filter(w => (w.mastery_level ?? 0) === 5);
    }

    // --- Tìm kiếm theo từ En, nghĩa VN, IPA ---
    if (searchValue) {
        words = words.filter(w => {
            const word = (w.words?.word || w.reference || '').toLowerCase();
            const ipa = (w.words?.ipa || w.ipa || '').toLowerCase();
            const meaning = (w.meaning || '').toLowerCase();
            return word.includes(searchValue) || ipa.includes(searchValue) || meaning.includes(searchValue);
        });
    }

    // --- Sắp xếp ---
    const [sortKey, sortDir] = sortValue.split('-');
    words.sort((a, b) => {
        const wordA = (a.words?.word || a.reference || '').toLowerCase();
        const wordB = (b.words?.word || b.reference || '').toLowerCase();
        if (sortKey === 'abc') {
            return sortDir === 'asc' ? wordA.localeCompare(wordB) : wordB.localeCompare(wordA);
        } else if (sortKey === 'mastery') {
            return (b.mastery_level ?? 0) - (a.mastery_level ?? 0);
        }
        // created: mới nhất / cũ nhất - thứ tự mặc định từ query
        return 0;
    });

    // Empty state
    if (words.length === 0) {
        let msg = 'Bộ từ này chưa có từ nào. Bấm "+ Thêm từ" để bắt đầu.';
        if (searchValue || filterValue !== 'all') {
            msg = 'Không tìm thấy từ nào phù hợp với tiêu chí của bạn.';
        }
        tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><p class="empty-state">${msg}</p></td></tr>`;
        return;
    }

    tbody.innerHTML = words.map((word, index) => createWordRowHTML(word, index)).join('');
}

function masterStatusOf(level) {
    const l = level ?? 0;
    if (l === 0) return { label: 'Chưa học', cls: 'mastery-unseen' };
    if (l >= 5) return { label: 'Đã thuộc', cls: 'mastery-mastered' };
    return { label: 'Đang học', cls: 'mastery-learning' };
}

function wordTypeLabel(type) {
    const map = {
        noun: 'Danh từ', verb: 'Động từ', adjective: 'Tính từ', adverb: 'Trạng từ',
        preposition: 'Giới từ', conjunction: 'Liên từ', pronoun: 'Đại từ', other: 'Khác'
    };
    return map[type] || type || '—';
}

function createWordRowHTML(word, index) {
    const w = word.words || {};
    const wordText = w.word || word.reference || '';
    const ipa = w.ipa || word.ipa || '';
    const status = masterStatusOf(word.mastery_level);
    const example = word.example || '';
    const meaning = word.meaning || '';

    return `
        <tr data-word-sense-id="${word.id}">
            <td data-label="STT">${index + 1}</td>
            <td data-label="Từ"><span class="word-text">${escapeHTML(wordText)}</span></td>
            <td data-label="IPA"><span class="word-ipa">/${escapeHTML(ipa)}/</span></td>
            <td data-label="Loại từ"><span class="word-type">${escapeHTML(wordTypeLabel(word.word_type))}</span></td>
            <td data-label="Nghĩa"><span class="word-meaning">${escapeHTML(meaning)}</span></td>
            <td data-label="Ví dụ"><span class="word-example">${example ? '"' + escapeHTML(example) + '"' : '—'}</span></td>
            <td data-label="Trạng thái"><span class="mastery-badge ${status.cls}">${status.label}</span></td>
            <td data-label="Thao tác">
                <div class="row-actions">
                    <button class="row-action-btn progress-reset" data-action="reset-progress" title="Đặt lại trạng thái học">↺</button>
                    <button class="row-action-btn" data-action="edit" title="Chỉnh sửa từ">✏️</button>
                    <button class="row-action-btn del" data-action="delete" title="Xóa từ">🗑️</button>
                </div>
            </td>
        </tr>
    `;
}

/* ============================================================
   XỬ LÝ CLICK TRONG BẢNG TỪ
   ============================================================ */
async function handleWordListClick(event) {
    const row = event.target.closest('tr[data-word-sense-id]');
    if (!row) return;
    const wordSenseId = row.dataset.wordSenseId;
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;

    if (action === 'edit') {
        const word = cachedWords.find(w => w.id === wordSenseId);
        if (word) {
            currentEditingSense = word;
            openEditWordModal(word);
        }
    } else if (action === 'delete') {
        const word = cachedWords.find(w => w.id === wordSenseId);
        if (word) {
            await handleDeleteWord(word);
        }
    } else if (action === 'reset-progress') {
        await handleResetProgress(wordSenseId);
    }
}

async function handleDeleteWord(word) {
    const { data: { user } } = await authService.getUser();
    const displayWord = word.words?.word || word.reference || '';

    const confirmed = confirm(`Bạn có chắc chắn muốn xóa từ "${displayWord}" khỏi bộ từ này?\nHành động này không thể hoàn tác.`);
    if (!confirmed) return;

    const { error } = await dbService.deleteWordComplete(currentSet.id, word.id);
    if (error) {
        showToast(`Không thể xóa từ: ${error.message}`, 'error');
    } else {
        showToast(`Đã xóa từ "${displayWord}".`, 'success');
        await loadAndRenderWords();
    }
}

async function handleResetProgress(wordSenseId) {
    const { data: { user } } = await authService.getUser();
    if (!user) return;

    const confirmed = confirm('Bạn có muốn đặt lại trạng thái học của từ này về "Chưa học"?');
    if (!confirmed) return;

    const { error } = await dbService.upsertWordProgress(wordSenseId, user.id, {
        mastery_level: 0,
        review_due_at: new Date().toISOString()
    });

    if (error) {
        showToast(`Không thể đặt lại trạng thái: ${error.message}`, 'error');
    } else {
        showToast('Đã đặt lại trạng thái học của từ.', 'success');
        await loadAndRenderWords();
    }
}

/* ============================================================
   HỌC THEO CHẾ ĐỘ (flashcard / typing)
   ============================================================ */
async function startPracticeMode(mode) {
    if (cachedWords.length === 0) {
        showToast('Bộ từ này chưa có từ nào để học.', 'info');
        return;
    }
    // Lưu chế độ vào sessionStorage để phiên luyện tập biết khởi động đúng chế độ
    sessionStorage.setItem('engfore_practice_mode', mode);
    window.location.hash = `#/set/${currentSet.id}/practice`;
}

/* ============================================================
   EDIT SET MODAL
   ============================================================ */
function openEditSetModal() {
    // Tạo modal nếu chưa tồn tại
    let overlay = document.getElementById('edit-set-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'edit-set-modal-overlay';
        overlay.className = 'edit-set-modal-overlay hidden';
        overlay.innerHTML = `
            <div class="edit-set-modal">
                <button class="modal-close-btn" id="edit-set-close-btn">&times;</button>
                <h2>Chỉnh sửa bộ từ</h2>
                <form id="edit-set-form">
                    <div class="form-group">
                        <label for="edit-set-name">Tên bộ từ</label>
                        <input type="text" id="edit-set-name" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-set-desc">Mô tả</label>
                        <textarea id="edit-set-desc" rows="3" placeholder="Mô tả ngắn về bộ từ này..."></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" id="edit-set-cancel-btn">Hủy</button>
                        <button type="submit" class="btn-primary" id="edit-set-save-btn">Lưu thay đổi</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);

        // Close listeners
        const hide = () => overlay.classList.add('hidden');
        overlay.querySelector('#edit-set-close-btn').addEventListener('click', hide);
        overlay.querySelector('#edit-set-cancel-btn').addEventListener('click', hide);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });
        overlay.querySelector('#edit-set-form').addEventListener('submit', handleEditSetSubmit);
        cleanupFunctions.push(() => overlay.remove());
    }

    // Điền dữ liệu hiện tại
    overlay.querySelector('#edit-set-name').value = currentSet.name || '';
    overlay.querySelector('#edit-set-desc').value = currentSet.description || '';
    overlay.classList.remove('hidden');
}

async function handleEditSetSubmit(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('edit-set-save-btn');
    const name = document.getElementById('edit-set-name').value.trim();
    const description = document.getElementById('edit-set-desc').value.trim();

    if (!name) {
        showToast('Tên bộ từ không được để trống.', 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang lưu...';

    const update = { name };
    if (currentSet.description !== description) update.description = description;

    const { error } = await dbService.updateVocabularySetMeta(currentSet.id, update);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Lưu thay đổi';

    if (error) {
        showToast(`Không thể lưu: ${error.message}`, 'error');
        return;
    }

    currentSet = { ...currentSet, ...update };
    renderSetHeader(currentSet);
    document.getElementById('edit-set-modal-overlay').classList.add('hidden');
    showToast('Đã cập nhật bộ từ thành công.', 'success');
}

async function handleDeleteSet() {
    const confirmed = confirm(`Bạn có chắc chắn muốn xóa bộ từ "${currentSet.name}"?\nTất cả dữ liệu trong bộ từ sẽ bị xóa và không thể hoàn tác.`);
    if (!confirmed) return;

    const { error } = await dbService.deleteVocabularySet(currentSet.id);
    if (error) {
        showToast(`Không thể xóa bộ từ: ${error.message}`, 'error');
    } else {
        showToast('Đã xóa bộ từ thành công.', 'success');
        window.location.hash = '#/';
    }
}

/* ============================================================
   ADD / EDIT WORD MODAL
   ============================================================ */
function openAddWordModal() {
    const modal = document.getElementById('add-word-modal');
    if (!modal) return;
    currentEditingSense = null;
    const form = modal.querySelector('form');
    form.reset();
    clearFieldErrors();
    modal.querySelector('h2').textContent = 'Thêm từ mới';
    modal.querySelector('#add-word-submit-btn').textContent = 'Thêm từ';
    modal.classList.remove('hidden');
}

function showEditWordModal(sense) {
    const modal = document.getElementById('add-word-modal');
    if (!modal) return;
    const form = modal.querySelector('form');

    modal.querySelector('h2').textContent = 'Chỉnh sửa từ';
    form.querySelector('#add-word-submit-btn').textContent = 'Cập nhật từ';
    clearFieldErrors();

    form.querySelector('#word-input').value = sense.words?.word || sense.reference || '';
    form.querySelector('#ipa-input').value = sense.words?.ipa || sense.ipa || '';
    form.querySelector('#word-type-select').value = sense.word_type || 'noun';
    form.querySelector('#meaning-input').value = sense.meaning || '';
    form.querySelector('#example-input').value = sense.example || '';
    form.querySelector('#description-input').value = sense.description || '';
    form.querySelector('#cefr-select').value = sense.words?.cefr_level || sense.cefr_level || '';

    modal.classList.remove('hidden');
}

function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('#add-word-form input').forEach(el => el.style.borderColor = '');
}

function validateWordForm(form) {
    let valid = true;
    const wordVal = form.querySelector('#word-input').value.trim();
    const meaningVal = form.querySelector('#meaning-input').value.trim();
    const wordError = document.getElementById('word-input-error');
    const meaningError = document.getElementById('meaning-input-error');

    if (!wordVal) {
        wordError.textContent = 'Vui lòng nhập từ tiếng Anh.';
        form.querySelector('#word-input').style.borderColor = '#ff4d4d';
        valid = false;
    } else {
        wordError.textContent = '';
        form.querySelector('#word-input').style.borderColor = '';
    }

    if (!meaningVal) {
        meaningError.textContent = 'Vui lòng nhập nghĩa tiếng Việt.';
        form.querySelector('#meaning-input').style.borderColor = '#ff4d4d';
        valid = false;
    } else {
        meaningError.textContent = '';
        form.querySelector('#meaning-input').style.borderColor = '';
    }

    return valid;
}

async function handleAddWordSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('#add-word-submit-btn');

    if (!validateWordForm(form)) {
        showToast('Vui lòng kiểm tra lại các trường bắt buộc.', 'error');
        return;
    }

    const newWord = {
        word: form.querySelector('#word-input').value.trim(),
        ipa: form.querySelector('#ipa-input').value.trim(),
        word_type: form.querySelector('#word-type-select').value,
        meaning: form.querySelector('#meaning-input').value.trim(),
        example: form.querySelector('#example-input').value.trim(),
        description: form.querySelector('#description-input').value.trim(),
        cefr: form.querySelector('#cefr-select').value || null,
    };

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Đang lưu...';

    if (currentEditingSense) {
        // Chế độ sửa
        // 1. Luôn cập nhật bảng `word_senses` (loại từ, nghĩa, ví dụ, mô tả) - có RLS cho phép UPDATE.
        const { error: senseError } = await dbService.updateWordSenseDetails(currentEditingSense.id, newWord);
        if (senseError) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            showToast(`Không thể cập nhật từ: ${senseError.message}`, 'error');
            return;
        }

        // 2. Cập nhật bảng `words` (từ, IPA, CEFR) - best-effort vì bảng này có thể không cho UPDATE trực tiếp.
        const wordId = currentEditingSense.words?.id;
        if (wordId) {
            const { error: wordError } = await dbService.updateWordDetails(wordId, currentEditingSense.id, newWord);
            if (wordError) {
                // Không chặn: chỉ báo nhẹ nếu từ tiếng Anh/IPA không thể cập nhật (giới hạn RLS).
                console.warn('Không thể cập nhật bảng words (có thể do RLS):', wordError.message);
            }
        }

        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        document.getElementById('add-word-modal').classList.add('hidden');
        showToast('Đã cập nhật từ thành công.', 'success');
        await loadAndRenderWords();
        currentEditingSense = null;
    } else {
        // Chế độ thêm mới
        const { error } = await dbService.importWordsToSet(currentSet.id, [newWord]);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        if (error) {
            showToast(`Không thể thêm từ: ${error.message}`, 'error');
            return;
        }
        form.reset();
        clearFieldErrors();
        document.getElementById('add-word-modal').classList.add('hidden');
        showToast('Đã thêm từ mới thành công.', 'success');
        await loadAndRenderWords();
    }
}

/* ============================================================
   IMPORT AI (tái sử dụng)
   ============================================================ */
function trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const handleTabKey = (e) => {
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    };
    modal.addEventListener('keydown', handleTabKey);
    firstElement?.focus();
}

function setupModalCloseListeners(modalId, onOpen = () => {}, onClose = () => {}) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const openModal = () => {
        modal.classList.remove('hidden');
        trapFocus(modal);
        onOpen();
    };
    const closeModal = () => {
        modal.classList.add('hidden');
        onClose();
    };
    const closeModalBtn = modal.querySelector('.modal-close-btn');
    closeModalBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    return openModal;
}

function prepareAndShowModal() {
    const modal = document.getElementById('import-ai-modal');
    if (!modal) return;
    const promptTextEl = document.getElementById('ai-prompt-text');
    const prompt = `Tạo danh sách từ tiếng Anh theo chủ đề "${currentSet.name}".
Với mỗi từ, cung cấp thông tin theo thứ tự, mỗi trường ngăn cách bởi ký tự TAB:
Từ, IPA, Loại từ, Nghĩa (tiếng Việt), Ví dụ (tiếng Anh), Mô tả (tiếng Anh), Cấp độ CEFR.

QUY TẮC:
- Mỗi từ nằm trên một dòng riêng.
- Loại từ phải là một trong: noun, verb, adjective, adverb, preposition, conjunction, pronoun, other.
- Cấp độ CEFR phải là một trong: A1, A2, B1, B2, C1, C2.
- Không kèm dòng tiêu đề hay văn bản khác, chỉ dữ liệu.

Ví dụ:
astonish\təˈstɒnɪʃ\tverb\tlàm kinh ngạc\tHer capacity for hard work astonished her colleagues.\tTo surprise someone very much.\tB2`;
    promptTextEl.textContent = prompt;

    document.getElementById('ai-result-textarea').value = '';
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('import-btn').disabled = true;
    document.getElementById('import-status').textContent = '';
    modal.classList.remove('hidden');
}

async function handleCopyPrompt() {
    const promptText = document.getElementById('ai-prompt-text').textContent;
    await navigator.clipboard.writeText(promptText);
    const copyBtn = document.getElementById('copy-prompt-btn');
    copyBtn.textContent = 'Đã sao chép!';
    setTimeout(() => { copyBtn.textContent = 'Sao chép'; }, 2000);
    showToast('Đã sao chép prompt vào clipboard.', 'success');
}

function handlePreview() {
    const text = document.getElementById('ai-result-textarea').value;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const headers = ['Từ', 'IPA', 'Loại từ', 'Nghĩa', 'Ví dụ', 'Mô tả', 'CEFR'];
    parsedWords = [];

    lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 6) {
            parsedWords.push({
                word: parts[0]?.trim(),
                ipa: parts[1]?.trim(),
                word_type: parts[2]?.trim().toLowerCase(),
                meaning: parts[3]?.trim(),
                example: parts[4]?.trim(),
                description: parts[5]?.trim(),
                cefr: parts[6]?.trim().toUpperCase() || null,
            });
        }
    });

    const previewSection = document.getElementById('preview-section');
    const tableContainer = document.getElementById('preview-table-container');
    const importBtn = document.getElementById('import-btn');

    if (parsedWords.length > 0) {
        let tableHTML = '<table><thead><tr>';
        headers.forEach(h => tableHTML += `<th>${h}</th>`);
        tableHTML += '</tr></thead><tbody>';
        parsedWords.forEach(word => {
            tableHTML += '<tr>';
            tableHTML += `<td>${escapeHTML(word.word)}</td><td>${escapeHTML(word.ipa)}</td><td>${escapeHTML(word.word_type)}</td><td>${escapeHTML(word.meaning)}</td><td>${escapeHTML(word.example)}</td><td>${escapeHTML(word.description)}</td><td>${escapeHTML(word.cefr)}</td>`;
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table>';
        tableContainer.innerHTML = tableHTML;
        previewSection.classList.remove('hidden');
        importBtn.disabled = false;
    } else {
        tableContainer.innerHTML = '<p style="padding: 1rem; text-align: center;">Không tìm thấy từ hợp lệ. Vui lòng kiểm tra lại định dạng.</p>';
        previewSection.classList.remove('hidden');
        importBtn.disabled = true;
    }
}

async function handleImport() {
    if (parsedWords.length === 0 || !currentSet) return;

    const importBtn = document.getElementById('import-btn');
    const statusEl = document.getElementById('import-status');
    importBtn.disabled = true;
    statusEl.textContent = `Đang nhập ${parsedWords.length} từ...`;

    const { data, error } = await dbService.importWordsToSet(currentSet.id, parsedWords);

    if (error) {
        statusEl.textContent = `Lỗi: ${error.message}`;
        importBtn.disabled = false;
        showToast(`Không thể nhập từ: ${error.message}`, 'error');
    } else {
        statusEl.textContent = `Đã nhập thành công ${parsedWords.length} từ.`;
        showToast(`Đã nhập ${parsedWords.length} từ thành công.`, 'success');
        setTimeout(() => {
            document.getElementById('import-ai-modal').classList.add('hidden');
            loadAndRenderWords();
        }, 1500);
    }
}

/* ============================================================
   STATS MODAL (tái sử dụng)
   ============================================================ */
async function showStatsModal() {
    const modal = document.getElementById('set-stats-modal');
    if (!modal) return;
    const statusEl = document.getElementById('set-stats-status');
    const chartCanvas = document.getElementById('set-mastery-chart');
    const modalTitle = document.getElementById('set-stats-modal-title');

    modalTitle.textContent = `"${currentSet.name}" - Thống kê`;
    modal.classList.remove('hidden');
    statusEl.textContent = 'Đang tải thống kê...';

    const { data: { user } } = await authService.getUser();
    const { data: stats, error } = await dbService.getSetStatistics(currentSet.id, user.id);

    if (error || !stats) {
        statusEl.textContent = 'Không thể tải thống kê.';
        return;
    }

    if (stats.length === 0) {
        statusEl.textContent = 'Bộ từ này chưa có dữ liệu học tập.';
        return;
    }

    statusEl.textContent = '';

    const { Chart } = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/+esm');

    const labels = ['Chưa học', 'Mới học', 'Bắt đầu', 'Trung cấp', 'Nâng cao', 'Thuộc'];
    const colors = ['#4B5563', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6'];
    const chartData = new Array(6).fill(0);

    stats.forEach(stat => {
        if (stat.mastery_level >= 0 && stat.mastery_level < chartData.length) {
            chartData[stat.mastery_level] = stat.word_count;
        }
    });

    if (chartCanvas.chart) {
        chartCanvas.chart.destroy();
    }

    chartCanvas.chart = new Chart(chartCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Từ',
                data: chartData,
                backgroundColor: colors,
                borderColor: 'var(--sidebar-bg)',
                borderWidth: 2,
            }]
        },
    });
}

/* ============================================================
   TOAST + HELPER
   ============================================================ */
function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function debounce(func, delay) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

