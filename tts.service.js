/**
 * A simple Text-to-Speech service using the Web Speech API.
 */
export const ttsService = {
    /**
     * Speaks the given text using a US English voice.
     * @param {string} text The text to speak.
     */
    speak: (text) => {
        if (!text || typeof window === 'undefined') {
            console.warn('TTS not supported or no text provided.');
            return;
        }

        // Hủy ngay các luồng âm thanh đang phát dở (Web Speech + HTMLAudio).
        if (typeof window.speechSynthesis !== 'undefined') {
            window.speechSynthesis.cancel();
        }
        try {
            document.querySelectorAll('audio').forEach((el) => {
                try { el.pause(); el.currentTime = 0; } catch (e) {}
            });
        } catch (e) {}

        if (typeof window.speechSynthesis === 'undefined') {
            console.warn('TTS not supported or no text provided.');
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);

        // Prioritize a US English voice for consistency
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find(voice => voice.lang === 'en-US') || voices.find(voice => voice.lang.startsWith('en-'));
        utterance.lang = 'en-US';
        utterance.rate = 0.9; // Slightly slower for better clarity

        window.speechSynthesis.speak(utterance);
    }
};

// The voices list is loaded asynchronously. This helps ensure it's populated.
if (typeof window.speechSynthesis !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}