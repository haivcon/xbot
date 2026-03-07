const { dbRun } = require('./db/core');
(async () => {
    try {
        const result = await dbRun("UPDATE user_ai_memory SET conversationHistory = '[]' WHERE conversationHistory IS NOT NULL");
        console.log(`Poisoned AI history cleared! Updated ${result.changes} rows.`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
