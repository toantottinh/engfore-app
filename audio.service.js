let audioContext;
let correctBuffer;
let incorrectBuffer;

const soundPaths = {
    correct: '/assets/sounds/correct.mp3',
    incorrect: '/assets/sounds/incorrect.mp3',
};

/**
 * Khởi tạo AudioContext và tải trước các file âm thanh.
 * Cần được gọi sau một tương tác của người dùng (ví dụ: click).
 */
async function init() {
    if (audioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        const [correctResponse, incorrectResponse] = await Promise.all([
            fetch(soundPaths.correct),
            fetch(soundPaths.incorrect)
        ]);

        const [correctArrayBuffer, incorrectArrayBuffer] = await Promise.all([
            correctResponse.arrayBuffer(),
            incorrectResponse.arrayBuffer()
        ]);

        [correctBuffer, incorrectBuffer] = await Promise.all([
            audioContext.decodeAudioData(correctArrayBuffer),
            audioContext.decodeAudioData(incorrectArrayBuffer)
        ]);

        console.log('Audio service initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize audio service:', error);
    }
}

function playSound(buffer) {
    if (!audioContext || !buffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
}

export const audioService = {
    init,
    playCorrect: () => playSound(correctBuffer),
    playIncorrect: () => playSound(incorrectBuffer),
};