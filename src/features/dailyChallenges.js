const { randomInt } = require('crypto');

/**
 * Daily Challenges Feature Module
 * Provides daily challenges with rewards for users
 */

// Challenge types with their configurations
const CHALLENGE_TYPES = {
    checkin: {
        id: 'checkin',
        name: '📅 Điểm danh',
        nameEn: '📅 Check-in',
        description: 'Điểm danh hôm nay',
        descriptionEn: 'Check in today',
        points: 10,
        xp: 5,
        checkFn: 'checkCheckinChallenge'
    },
    aiChat: {
        id: 'aiChat',
        name: '🤖 Trò chuyện AI',
        nameEn: '🤖 AI Chat',
        description: 'Nói chuyện với AI ít nhất 3 lần',
        descriptionEn: 'Chat with AI at least 3 times',
        points: 15,
        xp: 10,
        target: 3,
        checkFn: 'checkAiChatChallenge'
    },
    playGame: {
        id: 'playGame',
        name: '🎮 Chơi game',
        nameEn: '🎮 Play Game',
        description: 'Chơi 1 ván game bất kỳ',
        descriptionEn: 'Play any game once',
        points: 10,
        xp: 8,
        checkFn: 'checkGameChallenge'
    },
    winGame: {
        id: 'winGame',
        name: '🏆 Thắng game',
        nameEn: '🏆 Win Game',
        description: 'Thắng 1 ván game',
        descriptionEn: 'Win any game',
        points: 25,
        xp: 15,
        checkFn: 'checkWinGameChallenge'
    },
    checkPrice: {
        id: 'checkPrice',
        name: '📊 Kiểm tra giá',
        nameEn: '📊 Check Price',
        description: 'Kiểm tra giá token',
        descriptionEn: 'Check token price',
        points: 5,
        xp: 3,
        checkFn: 'checkPriceChallenge'
    },
    groupMessage: {
        id: 'groupMessage',
        name: '💬 Hoạt động nhóm',
        nameEn: '💬 Group Activity',
        description: 'Gửi 5 tin nhắn trong nhóm',
        descriptionEn: 'Send 5 messages in group',
        points: 10,
        xp: 5,
        target: 5,
        checkFn: 'checkGroupMessageChallenge'
    },
    streak3: {
        id: 'streak3',
        name: '🔥 Streak 3 ngày',
        nameEn: '🔥 3-Day Streak',
        description: 'Điểm danh 3 ngày liên tiếp',
        descriptionEn: 'Check in 3 days in a row',
        points: 30,
        xp: 20,
        target: 3,
        checkFn: 'checkStreakChallenge'
    }
};

// Daily challenge pool (weighted)
const DAILY_CHALLENGE_POOL = [
    { type: 'checkin', weight: 3 },
    { type: 'aiChat', weight: 2 },
    { type: 'playGame', weight: 2 },
    { type: 'checkPrice', weight: 2 },
    { type: 'groupMessage', weight: 1 },
    { type: 'winGame', weight: 1 },
    { type: 'streak3', weight: 1 }
];

/**
 * Generate today's challenges for a user
 * @param {number} seed - Random seed based on date
 * @returns {Array} Array of challenge objects
 */
function generateDailyChallenges(seed = Date.now()) {
    // Use date-based seed for consistent daily challenges
    const today = new Date().toISOString().slice(0, 10);
    const dateSeed = parseInt(today.replace(/-/g, ''), 10);

    // Select 3 challenges weighted randomly
    const challenges = [];
    const usedTypes = new Set();

    // Always include checkin
    challenges.push({ ...CHALLENGE_TYPES.checkin, progress: 0 });
    usedTypes.add('checkin');

    // Add 2 more random challenges
    const availablePool = DAILY_CHALLENGE_POOL.filter((c) => !usedTypes.has(c.type));
    const totalWeight = availablePool.reduce((sum, c) => sum + c.weight, 0);

    for (let i = 0; i < 2 && availablePool.length > 0; i++) {
        const random = (dateSeed + i * 1000) % totalWeight;
        let cumulative = 0;

        for (const poolEntry of availablePool) {
            cumulative += poolEntry.weight;
            if (random < cumulative && !usedTypes.has(poolEntry.type)) {
                challenges.push({ ...CHALLENGE_TYPES[poolEntry.type], progress: 0 });
                usedTypes.add(poolEntry.type);
                break;
            }
        }
    }

    return challenges;
}

/**
 * Get localized challenge name
 */
function getChallengeDisplayName(challenge, lang = 'vi') {
    const isVietnamese = lang === 'vi' || lang.startsWith('vi');
    return isVietnamese ? challenge.name : challenge.nameEn;
}

/**
 * Get localized challenge description
 */
function getChallengeDisplayDesc(challenge, lang = 'vi') {
    const isVietnamese = lang === 'vi' || lang.startsWith('vi');
    return isVietnamese ? challenge.description : challenge.descriptionEn;
}

/**
 * Format challenge progress as a progress bar
 */
function formatProgressBar(current, target, width = 10) {
    const percent = Math.min(current / target, 1);
    const filled = Math.round(percent * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${current}/${target}`;
}

/**
 * Format all challenges for display
 */
function formatChallengesList(challenges, lang = 'vi') {
    return challenges.map((c, i) => {
        const name = getChallengeDisplayName(c, lang);
        const desc = getChallengeDisplayDesc(c, lang);
        const status = c.completed ? '✅' : '⬜';
        const target = c.target || 1;
        const progress = c.progress || 0;
        const progressBar = c.completed ? '✅ Hoàn thành' : formatProgressBar(progress, target);

        return `${status} ${name}\n   ${desc}\n   ${progressBar}\n   🎁 +${c.points} điểm, +${c.xp} XP`;
    }).join('\n\n');
}

/**
 * Calculate total available rewards
 */
function getTotalRewards(challenges) {
    return challenges.reduce((acc, c) => ({
        points: acc.points + c.points,
        xp: acc.xp + c.xp
    }), { points: 0, xp: 0 });
}

/**
 * Calculate earned rewards from completed challenges
 */
function getEarnedRewards(challenges) {
    return challenges.filter((c) => c.completed).reduce((acc, c) => ({
        points: acc.points + c.points,
        xp: acc.xp + c.xp
    }), { points: 0, xp: 0 });
}

module.exports = {
    CHALLENGE_TYPES,
    DAILY_CHALLENGE_POOL,
    generateDailyChallenges,
    getChallengeDisplayName,
    getChallengeDisplayDesc,
    formatProgressBar,
    formatChallengesList,
    getTotalRewards,
    getEarnedRewards
};
