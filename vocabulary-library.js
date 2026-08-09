import { authService } from './auth.service.js';
import { dbService } from './db.service.js';

// Biến để lưu trữ element DOM, tránh query nhiều lần
let vocabSetListContainer;
let rootElement;

/**
 * Tải và render component Vocabulary Library vào một element gốc.
 * @param {HTMLElement} element - Element để render component vào.
 */
export async function renderVocabularyLibrary(element) {
    rootElement = element;
    // 1. Tải CSS
    if (!document.querySelector('link[href="/vocabulary-library.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/vocabulary-library.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML
    const response = await fetch('/vocabulary-library.html');
    if (!response.ok) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Error loading vocabulary library.</p>`;
        return;
    }
    const html = await response.text();

    // 3. Render HTML
    rootElement.innerHTML = html;

    // 4. Gắn các event listener
    setupEventListeners();
    // 5. Tải và hiển thị danh sách các bộ từ
    await renderSetList();
}

/**
 * Gắn các event listener cho component Vocabulary Library.
 */
function setupEventListeners() {
    const addSetBtn = rootElement.querySelector('.add-set-btn');
    vocabSetListContainer = rootElement.querySelector('.vocab-set-list');
    
    if (!addSetBtn || !vocabSetListContainer) return;

    addSetBtn.addEventListener('click', handleCreateSet);

    // Sử dụng event delegation cho các hành động trên card
    vocabSetListContainer.addEventListener('click', handleCardActions);

    // Lắng nghe các thay đổi trên thanh tìm kiếm và sắp xếp
    const searchInput = rootElement.querySelector('.search-input');
    const sortSelect = rootElement.getElementById('sort-sets-select');

    searchInput.addEventListener('input', debounce(renderSetList, 300));
    sortSelect.addEventListener('change', renderSetList);

    // --- Advanced Search Listeners ---
    const advancedSearchToggle = rootElement.getElementById('advanced-search-toggle');
    const advancedSearchPanel = rootElement.getElementById('advanced-search-panel');
    
    advancedSearchToggle.addEventListener('click', () => {
        advancedSearchPanel.classList.toggle('hidden');
    });

    const applyAdvancedSearchBtn = rootElement.getElementById('apply-advanced-search-btn');
    applyAdvancedSearchBtn.addEventListener('click', renderSetList);

    const clearAdvancedSearchBtn = rootElement.getElementById('clear-advanced-search-btn');
    clearAdvancedSearchBtn.addEventListener('click', () => {
        rootElement.getElementById('contains-word-input').value = '';
        rootElement.getElementById('created-after-date').value = '';
        rootElement.getElementById('created-before-date').value = '';
        renderSetList();
    });
}

/**
 * Xử lý việc tạo bộ từ mới.
 */
async function handleCreateSet() {
    const setName = prompt("Nhập tên cho bộ từ vựng mới của bạn:");

    if (setName && setName.trim() !== '') {
        const { data: { user } } = await authService.getUser();
        if (!user) {
            alert('Lỗi: Bạn phải đăng nhập để tạo bộ từ.');
            return;
        }

        const { error } = await dbService.createVocabularySet(setName.trim(), user.id);

        if (error) {
            console.error('Lỗi khi tạo bộ từ:', error.message);
            alert(`Không thể tạo bộ từ: ${error.message}`);
        } else {
            await renderSetList(); // Render lại để hiển thị bộ từ mới
        }
    } else if (setName !== null) {
        alert('Tên bộ từ không được để trống.');
    }
}

/**
 * Xử lý các hành động trên card (sửa, xóa) bằng event delegation.
 * @param {Event} event 
 */
async function handleCardActions(event) {
    const target = event.target;
    const deleteButton = target.closest('.delete-set-btn');
    const editButton = target.closest('.edit-set-btn');

    if (deleteButton) {
        handleDeleteSet(deleteButton);
    } else if (editButton) {
        handleEditSet(editButton);
    }
}

/**
 * Xử lý xóa một bộ từ.
 * @param {HTMLElement} button 
 */
async function handleDeleteSet(button) {
    const setId = button.dataset.setId;
    const setName = button.dataset.setName;

    if (confirm(`Bạn có chắc chắn muốn xóa bộ từ "${setName}" không?
Hành động này không thể hoàn tác.`)) {
        const { error } = await dbService.deleteVocabularySet(setId);
        if (error) {
            alert(`Không thể xóa bộ từ: ${error.message}`);
        } else {
            await renderSetList();
        }
    }
}

/**
 * Xử lý sửa tên một bộ từ.
 * @param {HTMLElement} button 
 */
async function handleEditSet(button) {
    const setId = button.dataset.setId;
    const currentName = button.dataset.setName;
    const newName = prompt("Nhập tên mới cho bộ từ:", currentName);

    if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
        const { error } = await dbService.updateVocabularySetName(setId, newName.trim());
        if (error) {
            alert(`Không thể đổi tên bộ từ: ${error.message}`);
        } else {
            await renderSetList();
        }
    } else if (newName !== null && newName.trim() === '') {
        alert('Tên bộ từ không được để trống.');
    }
}

/**
 * Lấy dữ liệu và render danh sách các bộ từ vựng.
 */
async function renderSetList() {
    if (!vocabSetListContainer) return;
    vocabSetListContainer.innerHTML = `<p class="empty-state">Đang tải các bộ từ của bạn...</p>`;

    const { data: { user } } = await authService.getUser();
    if (!user) {
        vocabSetListContainer.innerHTML = `<p class="empty-state">Vui lòng đăng nhập để xem các bộ từ của bạn.</p>`;
        return;
    }

    // Thu thập tất cả các tiêu chí lọc và sắp xếp
    const sortValue = rootElement.getElementById('sort-sets-select').value;
    const [sortBy, sortOrder] = sortValue.split('-');
    
    const filters = {
        nameQuery: rootElement.querySelector('.search-input').value.trim(),
        containsWord: rootElement.getElementById('contains-word-input').value.trim(),
        createdAfter: rootElement.getElementById('created-after-date').value || null,
        createdBefore: rootElement.getElementById('created-before-date').value || null,
        sortBy: sortBy,
        sortOrderAsc: sortOrder === 'asc'
    };

    const { data: sets, error } = await dbService.advancedSearchVocabularySets(user.id, filters);

    if (error) {
        vocabSetListContainer.innerHTML = `<p class="empty-state" style="color: red;">Lỗi khi tải danh sách bộ từ: ${error.message}</p>`;
        return;
    }

    if (!sets || sets.length === 0) {
        if (Object.values(filters).some(val => val)) {
            vocabSetListContainer.innerHTML = `<p class="empty-state">Không tìm thấy bộ từ nào phù hợp với điều kiện của bạn.</p>`;
        } else {
            vocabSetListContainer.innerHTML = `<p class="empty-state">Bạn chưa có bộ từ vựng nào. Nhấn "+ Bộ từ mới" để tạo bộ đầu tiên.</p>`;
        }
        return;
    }

    vocabSetListContainer.innerHTML = sets.map(set => createSetCardHTML(set)).join('');
}

/**
 * Tạo chuỗi HTML cho một card bộ từ vựng.
 * @param {object} set - Đối tượng bộ từ vựng từ database.
 * @returns {string} - Chuỗi HTML.
 */
function createSetCardHTML(set) {
    const createdAt = new Date(set.created_at).toLocaleDateString('vi-VN', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
    const mastery = set.mastery_level ? `${Math.round(set.mastery_level * 100)}%` : 'N/A';

    return `
        <div class="vocab-set-card" data-set-id="${set.id}">
            <div class="card-actions">
                <button class="btn-icon edit-set-btn" data-set-id="${set.id}" data-set-name="${escapeHTML(set.name)}" title="Đổi tên bộ từ">✏️</button>
                <button class="btn-icon delete-set-btn" data-set-id="${set.id}" data-set-name="${escapeHTML(set.name)}" title="Xóa bộ từ">🗑️</button>
            </div>
            <a href="#/set/${set.id}" class="vocab-set-card-link">
                <h3 class="card-title">${escapeHTML(set.name)}</h3>
                <div class="card-meta">
                    <span>${set.word_count || 0} từ</span>
                    <span>•</span>
                    <span>Tạo: ${createdAt}</span>
                </div>
                <div class="card-footer">
                    <span>Độ thành thạo: ${mastery}</span>
                </div>
            </a>
        </div>
    `;
}

/** Helper để tránh XSS */
const escapeHTML = str => String(str).replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag]));

/**
 * Tạo một phiên bản "debounced" của một hàm.
 * @param {Function} func - Hàm cần debounce.
 * @param {number} delay - Thời gian chờ (ms).
 * @returns {Function}
 */
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}
