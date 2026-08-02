document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    const bars = document.querySelectorAll('.player-waveform .bar');
    const transcript = document.querySelector('.transcript-text');

    if (!playBtn || !transcript) return;

    let isPlaying = false;
    let progressIndex = 0;
    let interval = null;

    const totalBars = bars.length;
    const sentences = transcript.querySelectorAll('p');

    const setActiveBars = (count) => {
        bars.forEach((bar, i) => {
            bar.classList.toggle('active', i < count);
        });
    };

    const highlightSentence = (index) => {
        sentences.forEach((s, i) => {
            if (i === index) {
                const words = s.innerHTML.split(' ');
                s.innerHTML = words.map(w => {
                    return w.replace(/^([a-zA-Z]+)([.,!?]*)$/, '<span class="current">$1</span>$2');
                }).join(' ');
            } else {
                s.innerHTML = s.textContent;
            }
        });
    };

    const play = () => {
        isPlaying = true;
        playBtn.setAttribute('aria-label', 'Pause');
        playBtn.innerHTML = '<i class="icon" data-lucide="pause"></i>';
        lucide.createIcons();

        interval = setInterval(() => {
            progressIndex++;
            if (progressIndex >= totalBars) {
                progressIndex = 0;
            }
            setActiveBars(progressIndex + 1);
            const sentenceIndex = Math.floor((progressIndex / totalBars) * sentences.length);
            highlightSentence(sentenceIndex);
        }, 600);
    };

    const pause = () => {
        isPlaying = false;
        clearInterval(interval);
        playBtn.setAttribute('aria-label', 'Play');
        playBtn.innerHTML = '<i class="icon" data-lucide="play"></i>';
        lucide.createIcons();
    };

    playBtn.addEventListener('click', () => {
        if (isPlaying) pause();
        else play();
    });

    // Initialize all bars inactive
    setActiveBars(0);
});

