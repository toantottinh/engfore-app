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
    const example = wordData.example || '';

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

        if (answer === correct) {
            feedback.textContent = '✅ Chính xác!';
            feedback.className = 'typing-feedback success';
            input.disabled = true;
            form.querySelector('button').disabled = true;
            if (onCompleteCallback) {
                setTimeout(() => onCompleteCallback({ wrongAttempts }), 800);
            }
        } else {
            wrongAttempts++;
            feedback.textContent = `❌ Chưa đúng. Thử lại! (Gợi ý: ${wrongAttempts > 1 ? currentWord.words?.ipa || '' : 'gợi ý 1 ký tự đầu: ' + correct.charAt(0)})`;
            feedback.className = 'typing-feedback error';
            input.value = '';
            input.focus();
        }
    };

    form.addEventListener('submit', handleSubmit);
    input.focus();
}

export const typingGameMode = {
    init,
    setup
};
