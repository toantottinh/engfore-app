/**
 * Game Mode: Thẻ ghi nhớ (Flashcard)
 * Người dùng xem định nghĩa, tự nhớ lại từ, lật thẻ để kiểm tra.
 */
let currentWord = null;
let onCompleteCallback = null;
let wrongAttempts = 0;
let flipped = false;

function escapeHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
}

function init(wordData, onComplete) {
    currentWord = wordData;
    onCompleteCallback = onComplete;
    wrongAttempts = 0;
    flipped = false;

    const wordText = wordData.words?.word || wordData.reference || '';
    const ipa = wordData.words?.ipa || wordData.ipa || '';
    const meaning = wordData.meaning || '';
    const example = wordData.example || '';

    return `
        <div class="gamemode flashcard-mode">
            <div class="gamemode-header">
                <span class="gamemode-title">🃏 Thẻ ghi nhớ</span>
                <span class="gamemode-hint">Nhớ lại từ, sau đó lật thẻ để kiểm tra</span>
            </div>
            <div class="flashcard" id="flashcard">
                <div class="flashcard-front">
                    <p class="flashcard-question">${escapeHTML(meaning)}</p>
                    ${example ? `<p class="flashcard-example">"${escapeHTML(example)}"</p>` : ''}
                    <p class="flashcard-tap-hint">Bấm để lật thẻ</p>
                </div>
                <div class="flashcard-back">
                    <p class="flashcard-word">${escapeHTML(wordText)}</p>
                    ${ipa ? `<p class="flashcard-ipa">/${escapeHTML(ipa)}/</p>` : ''}
                    <p class="flashcard-meaning">${escapeHTML(meaning)}</p>
                </div>
            </div>
            <div class="flashcard-actions" id="flashcard-actions">
                <button class="gamemode-btn flip-btn" id="flip-btn">🔄 Lật thẻ</button>
                <button class="gamemode-btn known-btn" id="known-btn" disabled>Biết rồi</button>
                <button class="gamemode-btn learning-btn" id="learning-btn" disabled>Ôn lại</button>
            </div>
            <p class="flashcard-feedback" id="flashcard-feedback"></p>
        </div>
    `;
}

function setup(container) {
    const card = container.querySelector('#flashcard');
    const flipBtn = container.querySelector('#flip-btn');
    const knownBtn = container.querySelector('#known-btn');
    const learningBtn = container.querySelector('#learning-btn');
    const feedback = container.querySelector('#flashcard-feedback');

    const flip = () => {
        flipped = !flipped;
        card.classList.toggle('flipped', flipped);
        knownBtn.disabled = !flipped;
        learningBtn.disabled = !flipped;
        if (flipped) {
            flipBtn.textContent = '🔄 Lật lại';
        } else {
            flipBtn.textContent = '🔄 Lật thẻ';
        }
    };

    const finish = (known) => {
        if (!known) wrongAttempts++;
        feedback.textContent = known ? '✅ Tuyệt vời!' : '📝 Sẽ ôn lại từ này.';
        feedback.className = 'flashcard-feedback ' + (known ? 'success' : 'error');
        knownBtn.disabled = true;
        learningBtn.disabled = true;
        flipBtn.disabled = true;
        if (onCompleteCallback) {
            setTimeout(() => onCompleteCallback({ wrongAttempts }), 700);
        }
    };

    card.addEventListener('click', flip);
    flipBtn.addEventListener('click', flip);
    knownBtn.addEventListener('click', () => finish(true));
    learningBtn.addEventListener('click', () => finish(false));
}

export const flashcardGameMode = {
    init,
    setup
};
