import { dbService } from './db.service.js';

let currentEditingSense = null;
let currentSet = null;
let parsedWords = [];

/**
 * Tải và render component Vocabulary Detail.
 * @param {HTMLElement} rootElement - Element để render component vào.
 * @param {object} params - Tham số từ URL (e.g., { id: '...' }).
 */
export async function renderVocabularyDetail(rootElement, params) {
    // 1. Tải CSS
    if (!document.querySelector('link[href="/import-ai-modal.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/import-ai-modal.css';
        document.head.appendChild(link);
    }

    // Tải CSS cho modal thêm từ
    if (!document.querySelector('link[href="/add-word-modal.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/add-word-modal.css';
        document.head.appendChild(link);
    }

    if (!document.querySelector('link[href="/vocabulary-detail.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/vocabulary-detail.css';
        document.head.appendChild(link);
    }

    // 2. Tải HTML (trang chi tiết và các modals)
    const [detailResponse, importModalResponse, addModalResponse] = await Promise.all([
        fetch('/vocabulary-detail.html'),
        fetch('/import-ai-modal.html'),
        fetch('/add-word-modal.html')
    ]);

    if (!detailResponse.ok || !importModalResponse.ok || !addModalResponse.ok) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Error loading vocabulary detail.</p>`;
        return;
    }
    const detailHtml = await detailResponse.text();
    const importModalHtml = await importModalResponse.text();
    const addModalHtml = await addModalResponse.text();
    rootElement.innerHTML = detailHtml;
    document.body.insertAdjacentHTML('beforeend', importModalHtml);
    document.body.insertAdjacentHTML('beforeend', addModalHtml);

    // 3. Lấy dữ liệu và hiển thị
    const { data: set, error } = await dbService.getVocabularySetById(params.id);

    if (error || !set) {
        rootElement.innerHTML = `<p style="color: red; padding: 2rem;">Could not find the requested set.</p>`;
        return;
    }

    currentSet = set;

    const setNameHeading = document.getElementById('set-name-heading');
    if (setNameHeading) {
        setNameHeading.textContent = set.name;
    }

    // Lấy và hiển thị danh sách các từ trong bộ từ này
    await renderWordList();

    // 4. Thiết lập event listeners cho trang chi tiết
    setupDetailEventListeners(rootElement);
}

function setupDetailEventListeners() {
    const importAiBtn = document.querySelector('.import-ai-btn');
    const addWordBtn = document.querySelector('.add-word-btn');
    const practiceBtn = document.querySelector('.practice-btn');

    practiceBtn.addEventListener('click', () => {
        window.location.hash = `#/set/${currentSet.id}/practice`;
    });

    // --- Import AI Modal Listeners ---
    importAiBtn.addEventListener('click', () => {
        prepareAndShowModal();
    });
    setupModalCloseListeners('import-ai-modal');
    document.getElementById('copy-prompt-btn').addEventListener('click', handleCopyPrompt);
    document.getElementById('preview-btn').addEventListener('click', handlePreview);
    document.getElementById('import-btn').addEventListener('click', handleImport);

    // --- Add Word Modal Listeners ---
    addWordBtn.addEventListener('click', () => {
        const addWordModal = document.getElementById('add-word-modal');
        addWordModal.querySelector('form').reset();
        addWordModal.classList.remove('hidden');
    });
    setupModalCloseListeners('add-word-modal');
    document.getElementById('add-word-form').addEventListener('submit', handleAddWordSubmit);

    const wordListContainer = document.querySelector('.word-list');
    if (wordListContainer) {
        wordListContainer.addEventListener('click', async (event) => {
            const target = event.target;
            const wordCard = target.closest('.word-card');
            if (!wordCard) return;

            const senseId = wordCard.dataset.senseId;

            // Xử lý nút xóa
            if (target.closest('.delete-word-btn')) {
                const word = target.closest('.delete-word-btn').dataset.word;
                const isConfirmed = confirm(`Are you sure you want to remove "${word}" from this set?`);

                if (isConfirmed) {
                    const { error } = await dbService.removeWordFromSet(currentSet.id, senseId);
                    if (error) {
                        alert(`Failed to remove word: ${error.message}`);
                    } else {
                        await renderWordList();
                    }
                }
            }

            // Xử lý nút sửa
            if (target.closest('.edit-word-btn')) {
                // Tìm từ đầy đủ trong danh sách đã tải
                const words = (await dbService.getWordsInSet(currentSet.id)).data.map(item => item.word_senses);
                const senseToEdit = words.find(s => s.id === senseId);
                if (senseToEdit) {
                    currentEditingSense = senseToEdit;
                    showEditWordModal(senseToEdit);
                }
            }
        });
    }
}

function setupModalCloseListeners(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const closeModalBtn = modal.querySelector('.modal-close-btn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

function prepareAndShowModal() {
    const modal = document.getElementById('import-ai-modal');
    const promptTextEl = document.getElementById('ai-prompt-text');
    const prompt = `Generate a list of English words for the topic "${currentSet.name}".
For each word, provide the following information separated by a TAB character:
Word, IPA, Word Type, Meaning (in Vietnamese), Example (in English), Description (in English), CEFR Level.

RULES:
- Each word must be on a new line.
- Word Type must be one of: noun, verb, adjective, adverb, preposition, conjunction, pronoun, other.
- CEFR Level must be one of: A1, A2, B1, B2, C1, C2.
- Do not include a header row or any extra text, only the data.

Example:
astonish\təˈstɒnɪʃ\tverb\tlàm kinh ngạc\tHer capacity for hard work astonished her colleagues.\tTo surprise someone very much.\tB2`;
    promptTextEl.textContent = prompt;
    
    // Reset modal state
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
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
}

function handlePreview() {
    const text = document.getElementById('ai-result-textarea').value;
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const headers = ['Word', 'IPA', 'Type', 'Meaning', 'Example', 'Description', 'CEFR'];
    parsedWords = [];

    lines.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 6) { // Cần ít nhất 6 trường
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
            tableHTML += `<td>${word.word}</td><td>${word.ipa}</td><td>${word.word_type}</td><td>${word.meaning}</td><td>${word.example}</td><td>${word.description}</td><td>${word.cefr}</td>`;
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table>';
        tableContainer.innerHTML = tableHTML;
        previewSection.classList.remove('hidden');
        importBtn.disabled = false;
    } else {
        tableContainer.innerHTML = '<p style="padding: 1rem; text-align: center;">No valid words found. Please check the format.</p>';
        previewSection.classList.remove('hidden');
        importBtn.disabled = true;
    }
}

async function handleImport() {
    if (parsedWords.length === 0 || !currentSet) return;

    const importBtn = document.getElementById('import-btn');
    const statusEl = document.getElementById('import-status');
    importBtn.disabled = true;
    statusEl.textContent = `Importing ${parsedWords.length} words...`;

    const { data, error } = await dbService.importWordsToSet(currentSet.id, parsedWords);

    if (error) {
        statusEl.textContent = `Error: ${error.message}`;
        importBtn.disabled = false;
    } else {
        statusEl.textContent = data; // "Successfully imported X words."
        setTimeout(() => {
            document.getElementById('import-ai-modal').classList.add('hidden');
            renderWordList(); // Tải lại danh sách từ để hiển thị từ mới.
        }, 2000);
    }
}

function showEditWordModal(sense) {
    const modal = document.getElementById('add-word-modal');
    const form = modal.querySelector('form');

    modal.querySelector('h2').textContent = 'Edit Word';
    form.querySelector('button[type="submit"]').textContent = 'Update Word';

    form.querySelector('#word-input').value = sense.words.word;
    form.querySelector('#ipa-input').value = sense.words.ipa || '';
    form.querySelector('#word-type-select').value = sense.word_type;
    form.querySelector('#meaning-input').value = sense.meaning;
    form.querySelector('#example-input').value = sense.example || '';
    form.querySelector('#description-input').value = sense.description || '';
    form.querySelector('#cefr-select').value = sense.words.cefr_level || '';

    modal.classList.remove('hidden');
}

async function handleAddWordSubmit(event) {
    event.preventDefault();
    const form = event.target;

    const newWord = {
        word: form.querySelector('#word-input').value.trim(),
        ipa: form.querySelector('#ipa-input').value.trim(),
        word_type: form.querySelector('#word-type-select').value,
        meaning: form.querySelector('#meaning-input').value.trim(),
        example: form.querySelector('#example-input').value.trim(),
        description: form.querySelector('#description-input').value.trim(),
        cefr: form.querySelector('#cefr-select').value || null,
    };

    if (!newWord.word || !newWord.meaning) {
        alert('"Word" and "Meaning" are required.');
        return;
    }

    if (currentEditingSense) {
        // Chế độ sửa
        const { error } = await dbService.updateWordDetails(currentEditingSense.words.id, currentEditingSense.id, newWord);
        if (error) {
            alert(`Error updating word: ${error.message}`);
        } else {
            document.getElementById('add-word-modal').classList.add('hidden');
            await renderWordList();
        }
        currentEditingSense = null; // Reset lại trạng thái
    } else {
        // Chế độ thêm mới
        const { data, error } = await dbService.importWordsToSet(currentSet.id, [newWord]);
        if (error) {
            alert(`Error adding word: ${error.message}`);
        } else {
            form.reset();
            document.getElementById('add-word-modal').classList.add('hidden');
            await renderWordList();
        }
    }

    // Reset lại tiêu đề modal về mặc định
    document.getElementById('add-word-modal').querySelector('h2').textContent = 'Add New Word';
    form.querySelector('button[type="submit"]').textContent = 'Save Word';
}

/**
 * Lấy và render danh sách các từ trong bộ từ hiện tại.
 */
async function renderWordList() {
    const wordListContainer = document.querySelector('.word-list');
    if (!wordListContainer || !currentSet) return;

    const { data, error } = await dbService.getWordsInSet(currentSet.id);

    if (error) {
        wordListContainer.innerHTML = `<p class="empty-state" style="color: red;">Error loading words.</p>`;
        return;
    }

    const words = data.map(item => item.word_senses);

    if (words.length === 0) {
        wordListContainer.innerHTML = `<p class="empty-state">This set is empty. Add your first word or use Import AI.</p>`;
        return;
    }

    wordListContainer.innerHTML = words.map(word => createWordCardHTML(word)).join('');
}

/**
 * Tạo chuỗi HTML cho một thẻ từ.
 * @param {object} sense - Đối tượng word_senses (đã bao gồm word).
 * @returns {string}
 */
function createWordCardHTML(sense) {
    const word = sense.words;
    return `
        <div class="word-card" data-sense-id="${sense.id}">
            <button class="edit-word-btn" title="Edit word">✏️</button>
            <button class="delete-word-btn" data-sense-id="${sense.id}" data-word="${word.word}" title="Remove from set">&times;</button>
            <div class="word-card-header">
                <span class="word">${word.word}</span>
                <span class="ipa">/${word.ipa || '...'}/</span>
            </div>
            <div class="word-card-body">
                <p class="meaning">${sense.meaning}</p>
                <p class="example">"${sense.example || 'No example provided.'}"</p>
            </div>
        </div>
    `;
}