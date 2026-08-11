/**
 * Tiện ích phát âm sử dụng Web Speech API của trình duyệt.
 */

const synth = window.speechSynthesis;
let voices = [];

function getVoices() {
  if (voices.length === 0 && synth) {
    voices = synth.getVoices().filter(voice => voice.lang.startsWith('en'));
  }
}

// Tải danh sách giọng đọc khi có sẵn
if (synth && typeof synth.onvoiceschanged !== 'undefined') {
  synth.onvoiceschanged = getVoices;
}

/**
 * Phát âm một đoạn văn bản bằng giọng đọc tiếng Anh (en-US).
 * @param {string} text - Đoạn văn bản cần phát âm.
 */
export function speak(text) {
  if (!synth || !text) {
    console.warn('Speech synthesis not supported or text is empty.');
    return;
  }

  // Hủy bỏ bất kỳ phát âm nào đang diễn ra
  if (synth.speaking) {
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95; // Tốc độ đọc vừa phải

  // Ưu tiên giọng đọc Google US English nếu có
  const googleVoice = voices.find(voice => voice.name === 'Google US English');
  if (googleVoice) {
    utterance.voice = googleVoice;
  }

  synth.speak(utterance);
}