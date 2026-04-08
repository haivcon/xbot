/**
 * Tamagotchi Tool Handlers
 * AI function calling handlers for Banmao Onchain Tamagotchi
 */
const logger = require('../../../core/logger');
const log = logger.child('TamaTools');

module.exports = {
    /**
     * banmao_pet — Interact with and manage the Banmao Tamagotchi
     */
    async banmao_pet(args, context) {
        try {
            const tamagotchi = require('../../tamagotchi');
            const lang = context?.lang || 'en';
            const action = (args.action || 'status').toLowerCase();
            const userId = String(context?.userId || context?.chatId || '');
            const { BOT_OWNER_ID } = require('../../../config');
            const isOwner = userId === String(BOT_OWNER_ID);

            switch (action) {
                case 'status':
                case 'mood': {
                    const status = await tamagotchi.getFullStatus();
                    const m = status.moodInfo;
                    const s = status.state;
                    const stateEmoji = status.isRunning ? '🟢' : '🔴';

                    const happinessBar = '█'.repeat(Math.floor(s.happiness / 10)) + '░'.repeat(10 - Math.floor(s.happiness / 10));
                    const energyBar = '█'.repeat(Math.floor(s.energy / 10)) + '░'.repeat(10 - Math.floor(s.energy / 10));

                    let card = `${m.emoji} <b>Banmao — ${m.label}</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
                    card += `🎭 Mood: <b>${m.label}</b> ${m.emoji}\n`;
                    card += `💬 <i>${m.trigger}</i>\n\n`;
                    card += `⭐ Level: ${s.level} (${s.xp} XP)\n`;
                    card += `😊 Happiness: [${happinessBar}] ${s.happiness}%\n`;
                    card += `⚡ Energy: [${energyBar}] ${s.energy}%\n`;
                    card += `${stateEmoji} Status: ${status.isRunning ? 'Active' : 'Inactive'}\n`;

                    // Last on-chain data
                    if (status.lastData) {
                        card += `\n📊 <b>On-chain State</b>\n`;
                        if (status.lastData.price > 0) card += `• BANMAO: $${status.lastData.price.toFixed(8)}\n`;
                        if (status.lastData.holders > 0) card += `• Holders: ${status.lastData.holders.toLocaleString()}\n`;
                        card += `• Smart Money buys: ${status.lastData.smartMoneyBuys}\n`;
                    }

                    // Recent mood changes
                    if (status.recentMoods?.length > 0) {
                        card += `\n🕐 <b>Mood History</b>\n`;
                        const { MOODS } = tamagotchi;
                        for (const m of status.recentMoods.slice(0, 5)) {
                            card += `• ${MOODS[m.mood]?.emoji || '🐱'} ${m.mood} — ${m.createdAt}\n`;
                        }
                    }

                    return { displayMessage: card };
                }

                case 'feed': {
                    const result = await tamagotchi.interact('feed');
                    return { displayMessage: result.response + `\n⚡ Energy: ${result.state.energy}% | 😊 Happiness: ${result.state.happiness}% | ⭐ Lv.${result.state.level}` };
                }

                case 'play': {
                    const result = await tamagotchi.interact('play');
                    return { displayMessage: result.response + `\n⚡ Energy: ${result.state.energy}% | 😊 Happiness: ${result.state.happiness}% | ⭐ Lv.${result.state.level}` };
                }

                case 'pet': {
                    const result = await tamagotchi.interact('pet');
                    return { displayMessage: result.response + `\n😊 Happiness: ${result.state.happiness}% | ⭐ Lv.${result.state.level}` };
                }

                case 'start': {
                    if (!isOwner) return '❌ Only the bot owner can start the Tamagotchi engine.';
                    const groupId = args.groupId || String(context?.chatId || '');
                    const result = await tamagotchi.startTamagotchi(groupId);
                    return { displayMessage: `🟢 <b>Banmao Tamagotchi Started!</b>\n━━━━━━━━━━━━━━━━━━\n${tamagotchi.MOODS[result.mood]?.emoji || '🐱'} Current mood: ${result.mood}\n🔔 Mood updates will be sent to this chat.\n\n💡 Try: "feed banmao", "play with banmao", "pet banmao"` };
                }

                case 'stop': {
                    if (!isOwner) return '❌ Only the bot owner can stop the Tamagotchi.';
                    tamagotchi.stopTamagotchi();
                    return { displayMessage: `🔴 <b>Banmao Tamagotchi Stopped</b>\n━━━━━━━━━━━━━━━━━━\nBanmao will rest now... 😴` };
                }

                case 'check_mood': {
                    const result = await tamagotchi.checkMood();
                    const { MOODS } = tamagotchi;
                    const m = MOODS[result.mood] || MOODS.NEUTRAL;
                    return { displayMessage: `${m.emoji} <b>Mood Check</b>\n━━━━━━━━━━━━━━━━━━\nBanmao is: <b>${m.label}</b>\n${result.changed ? '🔄 Mood just changed!' : '📌 Same as before'}\n💬 ${m.trigger}` };
                }

                default:
                    return lang === 'vi'
                        ? '❓ Action không hợp lệ. Dùng: status, feed, play, pet, start, stop, check_mood'
                        : '❓ Invalid action. Use: status, feed, play, pet, start, stop, check_mood';
            }
        } catch (err) {
            log.error('banmao_pet error:', err);
            return `❌ Tamagotchi error: ${err.message}`;
        }
    }
};
