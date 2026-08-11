/**
 * Dịch vụ Text-to-Speech sử dụng Web Speech API của trình duyệt.
 */

const synth = window.speechSynthesis;

/**
 * Kiểm tra xem trình duyệt có hỗ trợ Web Speech API không.
 * @returns {boolean}
 */
function isSupported() {
  return 'speechSynthesis' in window && synth !== null;
}

/**
 * Phát âm một đoạn văn bản bằng giọng en-US.
 * Nếu đang có một yêu cầu phát âm khác, nó sẽ bị hủy.
 * @param {string} text - Đoạn văn bản cần phát âm.
 */
function speak(text) {
  if (!isSupported() || !text) {
    return;
  }

  // Hủy các yêu cầu phát âm trước đó để tránh chồng chéo
  if (synth.speaking) {
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95; // Tốc độ đọc vừa phải
  utterance.pitch = 1;

  synth.speak(utterance);
}

export const ttsService = {
  isSupported,
  speak,
};