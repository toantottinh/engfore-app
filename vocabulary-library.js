import { authService } from './auth.service.js';
import { dbService } from './db.service.js';

// Biến để lưu trữ element DOM, tránh query nhiều lần
let vocabSetListContainer;

/**
 * Tải và render component Vocabulary Library vào một element gốc.
 * @param {HTMLElement} rootElement - Element để render component vào.
 */
export async function renderVocabularyLibrary(rootElement) {
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
async function setupEventListeners() {
    const addSetBtn = document.querySelector('.add-set-btn'); // Nút thêm mới
    vocabSetListContainer = document.querySelector('.vocab-set-list');
    if (!addSetBtn) return;

    addSetBtn.addEventListener('click', async () => {
        const setName = prompt("Enter the name for your new vocabulary set:");

        if (setName && setName.trim() !== '') {
            // Lấy thông tin người dùng hiện tại
            const { data: { user } } = await authService.getUser();
            if (!user) {
                alert('Error: You must be logged in to create a set.');
                return;
            }

            const { data, error } = await dbService.createVocabularySet(setName.trim(), user.id);

            if (error) {
                console.error('Error creating set:', error.message);
                alert(`Failed to create set: ${error.message}`);
            } else {
                console.log('Set created successfully:', data);
                // Render lại danh sách để hiển thị bộ từ mới
                await renderSetList();
            }
        } else if (setName !== null) { // User clicked OK but input was empty
            alert('Set name cannot be empty.');
        }
        // Nếu setName là null (user nhấn Cancel), không làm gì cả.
    });

    // Xử lý tìm kiếm
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(async (event) => {
            const searchTerm = event.target.value.trim();
            await renderSetList(searchTerm);
        }, 300));
    }

    // Xử lý sắp xếp
    const sortSelect = document.getElementById('sort-sets-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', async () => {
            const searchTerm = document.querySelector('.search-input').value.trim();
            await renderSetList(searchTerm);
        });
    }

    // Sử dụng event delegation để xử lý sự kiện click trên các nút xóa
    vocabSetListContainer.addEventListener('click', async (event) => {
        const target = event.target;

        // Xử lý nút xóa
        if (target.closest('.delete-set-btn')) {
            const deleteButton = target.closest('.delete-set-btn');
            const setId = deleteButton.dataset.setId;
            const setName = deleteButton.dataset.setName;

            const isConfirmed = confirm(`Are you sure you want to delete the set "${setName}"?\nThis action cannot be undone.`);

            if (isConfirmed) {
                const { error } = await dbService.deleteVocabularySet(setId);
                if (error) {
                    console.error('Error deleting set:', error.message);
                    alert(`Failed to delete set: ${error.message}`);
                } else {
                    await renderSetList(); // Tải lại danh sách
                }
            }
        }

        // Xử lý nút sửa
        if (target.closest('.edit-set-btn')) {
            const editButton = target.closest('.edit-set-btn');
            const setId = editButton.dataset.setId;
            const currentName = editButton.dataset.setName;

            const newName = prompt("Enter the new name for the set:", currentName);

            if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
                const { error } = await dbService.updateVocabularySetName(setId, newName.trim());
                if (error) {
                    console.error('Error renaming set:', error.message);
                    alert(`Failed to rename set: ${error.message}`);
                } else {
                    await renderSetList(); // Tải lại danh sách để hiển thị tên mới
                }
            } else if (newName !== null && newName.trim() === '') {
                alert('Set name cannot be empty.');
            }
        }
    });
}

/**
 * Lấy dữ liệu và render danh sách các bộ từ vựng.
 * @param {string} [searchTerm=''] - Từ khóa tìm kiếm (tùy chọn).
 */
async function renderSetList(searchTerm = '') {
    if (!vocabSetListContainer) return;

    const { data: { user } } = await authService.getUser();
    if (!user) return;

    // Lấy giá trị sắp xếp từ dropdown
    const sortValue = document.getElementById('sort-sets-select').value;
    const [sortBy, sortOrder] = sortValue.split('-');
    const sortOptions = {
        sortBy: sortBy,
        ascending: sortOrder === 'asc'
    };

    let sets, error;

    if (searchTerm) {
        ({ data: sets, error } = await dbService.searchVocabularySets(user.id, searchTerm, sortOptions));
    } else {
        ({ data: sets, error } = await dbService.getVocabularySets(user.id, sortOptions));
    }

    if (error) {
        vocabSetListContainer.innerHTML = `<p class="empty-state" style="color: red;">Error loading vocabulary sets.</p>`;
        return;
    }

    if (sets.length === 0) {
        if (searchTerm) {
            vocabSetListContainer.innerHTML = `<p class="empty-state">No sets found for "${escapeHTML(searchTerm)}".</p>`;
        } else {
            vocabSetListContainer.innerHTML = `<p class="empty-state">You don't have any vocabulary sets yet. Click "+ New Set" to create one.</p>`;
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
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    return `
        <div class="vocab-set-card" data-set-id="${set.id}">
            <button class="edit-set-btn" data-set-id="${set.id}" data-set-name="${escapeHTML(set.name)}" title="Rename set">✏️</button>
            <button class="delete-set-btn" data-set-id="${set.id}" data-set-name="${escapeHTML(set.name)}" title="Delete set">&times;</button>
            <a href="#/set/${set.id}" class="vocab-set-card-link">
                <h3>${escapeHTML(set.name)}</h3>
                <p>Created on: ${createdAt}</p>
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