/**
 * Game Mode: Gõ từ (Typing)
 * Người dùng nhìn nghĩa tiếng Việt và gõ từ tiếng Anh tương ứng.
 */
let currentWord = null;
let onCompleteCallback = null;
let wrongAttempts = 0;

function escapeHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
}

function normalize(str) {
    return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function init(wordData, onComplete) {
    currentWord = wordData;
    onCompleteCallback = onComplete;
    wrongAttempts = 0;

    const wordText = wordData.words?.word || wordData.reference || '';
    const meaning = wordData.meaning || '';
    const ipa = wordData.words?.ipa || wordData.ipa || '';
    const wordType = wordData.word_type || '';
    const example = wordData.example || '';
    const memoryClue = wordData.memory_clue || '';
    const cefrLevel = wordData.cefr_level || '';

    return `
        <div class="gamemode typing-mode">
            <div class="gamemode-header">
                <span class="gamemode-title">⌨️ Gõ từ</span>
                <span class="gamemode-hint">Nhập từ tiếng Anh dựa trên nghĩa tiếng Việt</span>
            </div>
            <div class="typing-prompt">
                <p class="typing-meaning">${escapeHTML(meaning)}</p>
                ${example ? `<p class="typing-example">"${escapeHTML(example)}"</p>` : ''}
            </div>
            <form class="typing-form" id="typing-form">
                <input type="text" id="typing-input" class="typing-input" placeholder="Gõ từ tiếng Anh..." autocomplete="off" autofocus>
                <button type="submit" class="gamemode-btn primary">Kiểm tra</button>
            </form>
            <p class="typing-feedback" id="typing-feedback"></p>
        </div>
    `;
}

function setup(container) {
    const form = container.querySelector('#typing-form');
    const input = container.querySelector('#typing-input');
    const feedback = container.querySelector('#typing-feedback');

    const handleSubmit = (e) => {
        e.preventDefault();
        const answer = normalize(input.value);
        const correct = normalize(currentWord.words?.word || currentWord.reference || '');

        if (!answer) {
            feedback.textContent = 'Vui lòng nhập từ.';
            feedback.className = 'typing-feedback error';
            return;
        }

                if (answer === correct || correct.startsWith(answer)) {
            feedback.className = 'typing-feedback success';
            input.disabled = true;
            form.querySelector('button').disabled = true;
            if (onCompleteCallback) {
                setTimeout(() => onCompleteCallback({ wrongAttempts: 0 }), 800);
            }
        } else {
            wrongAttempts++;
            // Hiển thị đáp án đúng và thông tin chi tiết
            const correctAnswer = currentWord.words?.word || currentWord.reference || '';
            feedback.innerHTML = `<p>❌ Chưa chính xác</p><p>Đáp án đúng: <span class="font-semibold">${correctAnswer}</span></p>${ipa ? `<p>IPA: <strong>/${ipa}/</strong></p>` : ''}${wordType ? `<p>Loại từ: <strong>${wordType}</strong></p>` : ''}${meaning ? `<p>Nghĩa: <strong>${escapeHTML(meaning)}</strong></p>` : ''}${example ? `<p>Ví dụ: <em>"${escapeHTML(example)}"</em></p>` : ''}${memoryClue ? `<p>Memory Clue: ${memoryClue}</p>` : ''}${cefrLevel ? `<p>CEFR: <span class="${cefrBadgeClass(cefrLevel)}">${cefrLabel(cefrLevel)}</span></p>` : ''}`;
/* TTS: "Từ này sẽ được xem lại trong phiên luyện tập." */
try {
    window.ttsService?.speak('Từ này sẽ được xem lại trong phiên luyện tập.');
} catch (e) {
    /* TTS lỗi - không làm gián đoạn luyện tập */
}
            feedback.className = 'typing-feedback error';
            input.value = '';
            input.focus();
        }
    };

    form.addEventListener('submit', handleSubmit);
    input.focus();
}


function cefrBadgeClass(level) {
    const classes = {
        A1: 'bg-green-100 text-green-800',
        A2: 'bg-blue-100 text-blue-800',
        B1: 'bg-yellow-100 text-yellow-800',
        B2: 'bg-orange-100 text-orange-800',
        C1: 'bg-red-100 text-red-800',
        C2: 'bg-purple-100 text-purple-800',
    };
    return classes[level] || 'bg-gray-100 text-gray-800';
}

function cefrLabel(level) {
    return level || '';
}
export const typingGameMode = {
    init,
    setup
};
