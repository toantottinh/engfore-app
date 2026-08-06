const availableGameModes = ['typing', 'multiple-choice', 'listening'];

async function getGameModeForWord(wordData) {
    // For V2, this logic will be more complex.
    // For now, randomly select an available game mode.
    const modeName = availableGameModes[Math.floor(Math.random() * availableGameModes.length)];

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
        // Fallback to typing mode if init fails (e.g., not enough distractors)
        return (await import('./practice-engine.js')).practiceEngine.run((await import('/gamemodes/typing/index.js')).typingGameMode, wordData, container, onComplete, setId);
    }
    container.innerHTML = template;
    gameMode.setup(container);
}

export const practiceEngine = {
    getGameModeForWord,
    run
};