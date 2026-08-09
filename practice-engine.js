const availableGameModes = ['typing', 'flashcard'];

/**
 * Chọn game mode cho một từ.
 * @param {object} wordData - Dữ liệu từ.
 * @param {string|null} setId - ID bộ từ (null nếu là phiên ôn tập).
 * @param {string[]|null} forcedModes - Mảng các mode được ép dùng (từ nút "Học/Thẻ ghi nhớ/Gõ từ").
 */
async function getGameModeForWord(wordData, setId, forcedModes = null) {
    let modes = [...availableGameModes];

    // Multiple choice không phù hợp cho phiên ôn tập (không có setId).
    if (!setId) {
        modes = modes.filter(m => m !== 'multiple-choice');
    }

    // Áp dụng mode bị ép nếu có (từ nút chọn chế độ học).
    if (forcedModes && forcedModes.length > 0) {
        const compatible = forcedModes.filter(m => modes.includes(m));
        if (compatible.length > 0) {
            modes = compatible;
        }
    }

    // Chọn ngẫu nhiên một mode trong danh sách (hoặc mode ép đầu tiên).
    const modeName = modes[Math.floor(Math.random() * modes.length)];
    console.log(`Selected Game Mode: ${modeName}`);
    try {
        const { [modeName + 'GameMode']: gameMode } = await import(`/gamemodes/${modeName}/index.js`);
        return gameMode;
    } catch (error) {
        console.error(`Failed to load game mode: ${modeName}`, error);
        return null;
    }
}

async function run(gameMode, wordData, container, onComplete, setId) {
    const template = await gameMode.init(wordData, onComplete, setId);
    if (template === null) {
        // Fallback: nếu init không sinh được template, dùng mode typing.
        const { typingGameMode } = await import('/gamemodes/typing/index.js');
        container.innerHTML = typingGameMode.init(wordData, onComplete, setId);
        typingGameMode.setup(container);
        return;
    }
    container.innerHTML = template;
    gameMode.setup(container);
}

export const practiceEngine = {
    getGameModeForWord,
    run
};