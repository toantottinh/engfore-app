/**
 * Dịch vụ Text-to-Speech sử dụng Web Speech API của trình duyệt.
 * Một nguồn duy nhất — mọi màn hình (LearningSession, Review, Practice)
 * đều gọi qua ttsService này.
 */

const getSynth = () => (typeof window === 'undefined' ? null : window.speechSynthesis || null);

// Cache voice list đề phòng getVoices() trả rỗng lần đầu (lazy loading).
let cachedVoices = [];

/**
 * Kiểm tra xem trình duyệt có hỗ trợ Web Speech API không.
 * @returns {boolean}
 */
function isSupported() {
  return Boolean(getSynth());
}

/**
 * Refresh voice list. Browser điền voices bất đồng bộ qua sự kiện
 * `voiceschanged` → cache để speak() có ngay danh sách khi cần.
 */
function refreshVoices() {
  const synth = getSynth();
  if (!synth) return;
  const voices = synth.getVoices?.() || [];
  if (voices.length > 0) cachedVoices = voices;
}

// Đăng ký lắng nghe một lần để voices được nạp sớm (retry tự động khi sẵn sàng).
if (typeof window !== 'undefined' && window.speechSynthesis) {
  const handleVoicesChanged = () => refreshVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
  }
}

/**
 * Phát âm một đoạn văn bản bằng giọng en-US.
 * Tự hủy yêu cầu phát âm đang chạy để tránh chồng chéo.
 * Mọi lỗi đều được nuốt — không làm gián đoạn flow học tập.
 * @param {string} text - Đoạn văn bản cần phát âm.
 */
function speak(text) {
  if (!isSupported() || !text) {
    // Browser không hỗ trợ TTS → không crash, người dùng vẫn học bình thường.
    return;
  }
  const synth = getSynth();

  // Hủy các yêu cầu phát âm trước đó để tránh chồng chéo.
  try {
    synth.cancel();
  } catch (e) {
    /* ignore */
  }

  if (typeof SpeechSynthesisUtterance === 'undefined') return;

  // Voice list có thể chưa sẵn sàng lần đầu → refresh để dùng được ngay.
  refreshVoices();
  const voices = cachedVoices.length > 0 ? cachedVoices : (synth.getVoices?.() || []);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95; // Tốc độ đọc vừa phải
  utterance.pitch = 1;

  utterance.voice =
    voices.find((voice) => voice.lang === 'en-US') ||
    voices.find((voice) => voice.lang?.startsWith('en-')) ||
    null;

  try {
    synth.speak(utterance);
  } catch (e) {
    // TTS lỗi — không crash, không chặn rating/continue.
  }
}

export const ttsService = {
  isSupported,
  speak,
};
