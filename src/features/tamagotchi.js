/**
 * Banmao Onchain Tamagotchi — AI Pet with On-chain Emotions
 * Hackathon Feature #3: AI pet whose mood is driven 100% by Onchain OS data
 *
 * Mood Engine (runs every 10 minutes):
 *   volume24h ↑    → HAPPY 😺  (activates airdrop mode)
 *   holders ↑      → PROUD 😸  (shares achievement badge)
 *   price ↓↓       → SAD 😿    (requests community support)
 *   smartMoney BUY  → EXCITED 🙀 (suggests copy-trade)
 *   no activity     → SLEEPY 😴  (idle animation)
 *
 * Each mood triggers autonomous on-chain actions via Agentic Wallet on X Layer.
 */
const onchainos = require('../services/onchainos');
const logger = require('../core/logger');
const log = logger.child('Tamagotchi');

const XLAYER_CHAIN = '196';
const BANMAO_TOKEN = (require('../config').OKX_BANMAO_TOKEN_ADDRESS || '0x16d91d1615FC55B76d5f92365Bd60C069B46ef78').toLowerCase();

// ═══════════════════════════════════════════════════════
// Mood Definitions
// ═══════════════════════════════════════════════════════

const MOODS = {
    HAPPY: { emoji: '😺', label: 'Happy', color: '#4CAF50', animation: 'bounce', trigger: 'Volume surge detected!' },
    PROUD: { emoji: '😸', label: 'Proud', color: '#FF9800', animation: 'glow', trigger: 'New holders joining!' },
    EXCITED: { emoji: '🙀', label: 'Excited', color: '#E91E63', animation: 'shake', trigger: 'Smart Money buying!' },
    SAD: { emoji: '😿', label: 'Sad', color: '#607D8B', animation: 'droop', trigger: 'Price declining...' },
    SLEEPY: { emoji: '😴', label: 'Sleepy', color: '#9E9E9E', animation: 'float', trigger: 'Low activity period' },
    ANGRY: { emoji: '😾', label: 'Angry', color: '#F44336', animation: 'vibrate', trigger: 'Whale dumping!' },
    LOVE: { emoji: '😻', label: 'In Love', color: '#E91E63', animation: 'heartbeat', trigger: 'Community growing!' },
    NEUTRAL: { emoji: '🐱', label: 'Calm', color: '#2196F3', animation: 'idle', trigger: 'Markets stable' }
};

// State
let _currentMood = 'NEUTRAL';
let _moodHistory = [];
let _moodInterval = null;
let _lastMoodData = null;
let _previousData = null;
let _dbInit = false;

const MOOD_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_MOOD_HISTORY = 144; // 24 hours of 10-min checks

// ═══════════════════════════════════════════════════════
// DB
// ═══════════════════════════════════════════════════════

async function initDB() {
    if (_dbInit) return;
    try {
        const { dbRun } = require('../../db/core');
        await dbRun(`CREATE TABLE IF NOT EXISTS tamagotchi_state (
            id INTEGER PRIMARY KEY DEFAULT 1,
            mood TEXT DEFAULT 'NEUTRAL',
            energy INTEGER DEFAULT 100,
            happiness INTEGER DEFAULT 50,
            level INTEGER DEFAULT 1,
            xp INTEGER DEFAULT 0,
            totalFeeds INTEGER DEFAULT 0,
            totalPlays INTEGER DEFAULT 0,
            notifyGroupId TEXT,
            enabled INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS tamagotchi_mood_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mood TEXT NOT NULL,
            trigger TEXT,
            banmaoPrice REAL,
            volume24h REAL,
            holders INTEGER,
            smartMoneyBuys INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now'))
        )`);
        await dbRun(`CREATE TABLE IF NOT EXISTS tamagotchi_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mood TEXT,
            actionType TEXT,
            description TEXT,
            txHash TEXT,
            createdAt TEXT DEFAULT (datetime('now'))
        )`);
        // Ensure row exists
        await dbRun('INSERT OR IGNORE INTO tamagotchi_state (id) VALUES (1)');
        _dbInit = true;
    } catch (err) {
        log.error('Tamagotchi DB init error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════
// MOOD ENGINE — Core Logic
// ═══════════════════════════════════════════════════════

/**
 * Fetch on-chain data and determine Banmao's mood
 */
async function checkMood() {
    try {
        // Fetch multiple data points from Onchain OS
        const [priceData, holderData, signalData, tradeData] = await Promise.allSettled([
            onchainos.getMarketPrice([{ chainIndex: XLAYER_CHAIN, tokenContractAddress: BANMAO_TOKEN }]),
            onchainos.getTokenHolder(XLAYER_CHAIN, BANMAO_TOKEN),
            onchainos.getSignalList(XLAYER_CHAIN, { walletType: '1,3,4', tokenContractAddress: BANMAO_TOKEN }),
            onchainos.getMarketTrades(XLAYER_CHAIN, BANMAO_TOKEN, { tagFilter: '3,4', limit: '20' })
        ]);

        const currentData = {
            price: 0,
            volume24h: 0,
            holders: 0,
            smartMoneyBuys: 0,
            smartMoneySells: 0,
            timestamp: Date.now()
        };

        // Parse price
        if (priceData.status === 'fulfilled' && priceData.value) {
            const p = Array.isArray(priceData.value) ? priceData.value[0] : priceData.value;
            currentData.price = Number(p?.price || 0);
        }

        // Parse holders
        if (holderData.status === 'fulfilled' && holderData.value) {
            const h = Array.isArray(holderData.value) ? holderData.value[0] : holderData.value;
            currentData.holders = Number(h?.holderCount || h?.totalHolders || 0);
        }

        // Parse smart money signals
        if (signalData.status === 'fulfilled' && Array.isArray(signalData.value)) {
            currentData.smartMoneyBuys = signalData.value.length;
        }

        // Parse recent trades
        if (tradeData.status === 'fulfilled' && Array.isArray(tradeData.value)) {
            for (const trade of tradeData.value) {
                const side = String(trade.type || trade.side || '').toLowerCase();
                if (side.includes('sell') || side === '2') currentData.smartMoneySells++;
            }
        }

        // Determine mood based on data changes
        const newMood = determineMood(currentData, _previousData);
        const previousMood = _currentMood;

        _currentMood = newMood;
        _previousData = currentData;
        _lastMoodData = currentData;

        // Track history
        _moodHistory.push({ mood: newMood, data: currentData, timestamp: Date.now() });
        if (_moodHistory.length > MAX_MOOD_HISTORY) _moodHistory.shift();

        // Log mood change
        await logMoodChange(newMood, currentData);

        // Execute mood-based action if mood changed
        if (newMood !== previousMood) {
            log.info(`Mood changed: ${previousMood} → ${newMood} (${MOODS[newMood]?.trigger})`);
            await executeMoodAction(newMood, currentData);
        }

        return { mood: newMood, data: currentData, changed: newMood !== previousMood };

    } catch (err) {
        log.error('checkMood error:', err.message);
        return { mood: _currentMood, error: err.message };
    }
}

/**
 * Determine mood from on-chain data
 */
function determineMood(current, previous) {
    // Smart Money buying → EXCITED
    if (current.smartMoneyBuys >= 3) return 'EXCITED';

    // Whale dumping → ANGRY
    if (current.smartMoneySells >= 5) return 'ANGRY';

    if (previous) {
        const priceChange = previous.price > 0
            ? ((current.price - previous.price) / previous.price) * 100
            : 0;
        const holderChange = current.holders - (previous.holders || 0);

        // Price dropped > 10% → SAD
        if (priceChange < -10) return 'SAD';

        // Price up > 5% → HAPPY
        if (priceChange > 5) return 'HAPPY';

        // Holders growing → PROUD
        if (holderChange > 10) return 'PROUD';

        // Growing community → LOVE
        if (holderChange > 50) return 'LOVE';
    }

    // Low activity → SLEEPY
    if (current.smartMoneyBuys === 0 && current.smartMoneySells === 0) return 'SLEEPY';

    return 'NEUTRAL';
}

// ═══════════════════════════════════════════════════════
// MOOD ACTIONS — Autonomous On-chain Responses
// ═══════════════════════════════════════════════════════

async function executeMoodAction(mood, data) {
    try {
        const config = await getState();
        const groupId = config?.notifyGroupId;

        // Generate mood message
        const moodInfo = MOODS[mood] || MOODS.NEUTRAL;
        const msg = formatMoodMessage(mood, moodInfo, data);

        // Send to Telegram group
        if (groupId) {
            try {
                const bot = require('../core/bot').bot;
                await bot.sendMessage(groupId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
            } catch (tgErr) {
                log.warn('Telegram mood notification error:', tgErr.message);
            }
        }

        // Record action
        await initDB();
        const { dbRun } = require('../../db/core');
        await dbRun('INSERT INTO tamagotchi_actions (mood, actionType, description) VALUES (?, ?, ?)',
            [mood, 'mood_change', moodInfo.trigger]);

        // Update state
        let happiness = config?.happiness || 50;
        let energy = config?.energy || 100;
        let xp = config?.xp || 0;

        switch (mood) {
            case 'HAPPY': happiness = Math.min(100, happiness + 10); xp += 5; break;
            case 'EXCITED': happiness = Math.min(100, happiness + 15); xp += 10; break;
            case 'PROUD': happiness = Math.min(100, happiness + 8); xp += 8; break;
            case 'LOVE': happiness = Math.min(100, happiness + 20); xp += 15; break;
            case 'SAD': happiness = Math.max(0, happiness - 10); energy = Math.max(0, energy - 5); break;
            case 'ANGRY': happiness = Math.max(0, happiness - 15); energy = Math.max(0, energy - 10); break;
            case 'SLEEPY': energy = Math.max(0, energy - 3); break;
        }

        // Level up every 100 XP
        const level = Math.floor(xp / 100) + 1;

        await dbRun("UPDATE tamagotchi_state SET mood = ?, happiness = ?, energy = ?, xp = ?, level = ?, updatedAt = datetime('now') WHERE id = 1",
            [mood, happiness, energy, xp, level]);

    } catch (err) {
        log.error('executeMoodAction error:', err.message);
    }
}

function formatMoodMessage(mood, moodInfo, data) {
    let msg = `${moodInfo.emoji} <b>Banmao is ${moodInfo.label}!</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💬 <i>${moodInfo.trigger}</i>\n\n`;

    // Market data
    msg += `📊 <b>On-chain Data</b>\n`;
    if (data.price > 0) msg += `• Price: $${data.price.toFixed(8)}\n`;
    if (data.holders > 0) msg += `• Holders: ${data.holders.toLocaleString()}\n`;
    if (data.smartMoneyBuys > 0) msg += `• Smart Money buys: ${data.smartMoneyBuys}\n`;
    if (data.smartMoneySells > 0) msg += `• Whale sells: ${data.smartMoneySells}\n`;

    // Mood-specific messages
    switch (mood) {
        case 'HAPPY':
            msg += `\n🎉 <i>Banmao is dancing! The community is thriving!</i>`;
            break;
        case 'EXCITED':
            msg += `\n🚀 <i>Smart Money is accumulating! Banmao senses big moves!</i>`;
            break;
        case 'PROUD':
            msg += `\n🏆 <i>More friends joining the family! Banmao is proud!</i>`;
            break;
        case 'SAD':
            msg += `\n💧 <i>Banmao needs a hug... HODL together!</i>`;
            break;
        case 'ANGRY':
            msg += `\n💢 <i>Whales dumping? Banmao is not happy...</i>`;
            break;
        case 'SLEEPY':
            msg += `\n💤 <i>Markets are quiet... Banmao takes a nap...</i>`;
            break;
    }

    return msg;
}

// ═══════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════

async function startTamagotchi(groupId) {
    await initDB();
    const { dbRun } = require('../../db/core');

    if (groupId) {
        await dbRun("UPDATE tamagotchi_state SET notifyGroupId = ?, enabled = 1, updatedAt = datetime('now') WHERE id = 1", [groupId]);
    } else {
        await dbRun("UPDATE tamagotchi_state SET enabled = 1, updatedAt = datetime('now') WHERE id = 1");
    }

    if (_moodInterval) return { success: true, message: 'Already running' };

    // Run first check
    checkMood().catch(err => log.error('Initial mood check error:', err.message));

    // Schedule recurring checks
    _moodInterval = setInterval(() => {
        checkMood().catch(err => log.error('Mood check error:', err.message));
    }, MOOD_CHECK_INTERVAL_MS);

    log.info('Tamagotchi started');
    return { success: true, mood: _currentMood };
}

function stopTamagotchi() {
    if (_moodInterval) {
        clearInterval(_moodInterval);
        _moodInterval = null;
    }
    log.info('Tamagotchi stopped');
    return { success: true };
}

async function getState() {
    await initDB();
    const { dbGet } = require('../../db/core');
    return await dbGet('SELECT * FROM tamagotchi_state WHERE id = 1');
}

async function getFullStatus() {
    const state = await getState();
    const { dbAll } = require('../../db/core');
    const recentMoods = await dbAll('SELECT * FROM tamagotchi_mood_log ORDER BY createdAt DESC LIMIT 24') || [];
    const recentActions = await dbAll('SELECT * FROM tamagotchi_actions ORDER BY createdAt DESC LIMIT 10') || [];

    return {
        mood: _currentMood,
        moodInfo: MOODS[_currentMood] || MOODS.NEUTRAL,
        state: {
            level: state?.level || 1,
            xp: state?.xp || 0,
            happiness: state?.happiness || 50,
            energy: state?.energy || 100,
            enabled: !!state?.enabled
        },
        isRunning: !!_moodInterval,
        lastData: _lastMoodData,
        moodHistory: _moodHistory.slice(-24),
        recentMoods,
        recentActions,
        allMoods: MOODS
    };
}

async function logMoodChange(mood, data) {
    try {
        const { dbRun } = require('../../db/core');
        await dbRun('INSERT INTO tamagotchi_mood_log (mood, trigger, banmaoPrice, holders, smartMoneyBuys) VALUES (?, ?, ?, ?, ?)',
            [mood, MOODS[mood]?.trigger || '', data.price, data.holders, data.smartMoneyBuys]);
    } catch {}
}

/**
 * Interactive actions (user feeds/plays with Banmao)
 */
async function interact(action) {
    await initDB();
    const { dbRun, dbGet } = require('../../db/core');
    const state = await dbGet('SELECT * FROM tamagotchi_state WHERE id = 1');
    let happiness = state?.happiness || 50;
    let energy = state?.energy || 100;
    let xp = state?.xp || 0;
    let response = '';

    switch (action) {
        case 'feed':
            energy = Math.min(100, energy + 20);
            happiness = Math.min(100, happiness + 5);
            xp += 3;
            response = '🍖 Banmao đã được cho ăn! Năng lượng +20 😺';
            await dbRun("UPDATE tamagotchi_state SET energy = ?, happiness = ?, xp = ?, totalFeeds = totalFeeds + 1, updatedAt = datetime('now') WHERE id = 1",
                [energy, happiness, xp]);
            break;
        case 'play':
            happiness = Math.min(100, happiness + 15);
            energy = Math.max(0, energy - 10);
            xp += 5;
            response = '🎾 Banmao chơi vui quá! Hạnh phúc +15 😸';
            await dbRun("UPDATE tamagotchi_state SET energy = ?, happiness = ?, xp = ?, totalPlays = totalPlays + 1, updatedAt = datetime('now') WHERE id = 1",
                [energy, happiness, xp]);
            break;
        case 'pet':
            happiness = Math.min(100, happiness + 8);
            xp += 2;
            response = '🤗 Banmao thích được vuốt ve! 😻';
            await dbRun("UPDATE tamagotchi_state SET happiness = ?, xp = ?, updatedAt = datetime('now') WHERE id = 1",
                [happiness, xp]);
            break;
        default:
            response = '❓ Hành động không hợp lệ. Dùng: feed, play, pet';
    }

    return { response, state: { happiness, energy, xp, level: Math.floor(xp / 100) + 1 } };
}

// ═══════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════

module.exports = {
    startTamagotchi,
    stopTamagotchi,
    checkMood,
    getState,
    getFullStatus,
    interact,
    initDB,
    MOODS
};
