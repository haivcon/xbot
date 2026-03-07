/**
 * Achievement System Module
 * Defines achievements, badges, and milestones for users
 */

// Achievement categories
const ACHIEVEMENT_CATEGORIES = {
    CHECKIN: 'checkin',
    GAMING: 'gaming',
    SOCIAL: 'social',
    CRYPTO: 'crypto',
    AI: 'ai',
    STREAK: 'streak',
    MILESTONE: 'milestone'
};

// Achievement definitions
const ACHIEVEMENTS = {
    // Checkin achievements
    first_checkin: {
        id: 'first_checkin',
        name: '🌅 Ngày đầu tiên',
        nameEn: '🌅 First Day',
        description: 'Điểm danh lần đầu tiên',
        descriptionEn: 'Complete your first check-in',
        category: ACHIEVEMENT_CATEGORIES.CHECKIN,
        icon: '🌅',
        xp: 10,
        condition: { type: 'checkin_count', value: 1 }
    },
    checkin_10: {
        id: 'checkin_10',
        name: '📅 Một tuần rưỡi',
        nameEn: '📅 Ten Days',
        description: 'Điểm danh 10 lần',
        descriptionEn: 'Check in 10 times',
        category: ACHIEVEMENT_CATEGORIES.CHECKIN,
        icon: '📅',
        xp: 50,
        condition: { type: 'checkin_count', value: 10 }
    },
    checkin_30: {
        id: 'checkin_30',
        name: '📆 Một tháng',
        nameEn: '📆 One Month',
        description: 'Điểm danh 30 lần',
        descriptionEn: 'Check in 30 times',
        category: ACHIEVEMENT_CATEGORIES.CHECKIN,
        icon: '📆',
        xp: 150,
        condition: { type: 'checkin_count', value: 30 }
    },
    checkin_100: {
        id: 'checkin_100',
        name: '🗓️ Trăm ngày',
        nameEn: '🗓️ Century',
        description: 'Điểm danh 100 lần',
        descriptionEn: 'Check in 100 times',
        category: ACHIEVEMENT_CATEGORIES.CHECKIN,
        icon: '🗓️',
        xp: 500,
        condition: { type: 'checkin_count', value: 100 }
    },

    // Streak achievements
    streak_3: {
        id: 'streak_3',
        name: '🔥 Khởi động',
        nameEn: '🔥 Getting Started',
        description: 'Streak 3 ngày',
        descriptionEn: '3-day streak',
        category: ACHIEVEMENT_CATEGORIES.STREAK,
        icon: '🔥',
        xp: 30,
        condition: { type: 'streak', value: 3 }
    },
    streak_7: {
        id: 'streak_7',
        name: '🔥🔥 Một tuần',
        nameEn: '🔥🔥 Week Warrior',
        description: 'Streak 7 ngày',
        descriptionEn: '7-day streak',
        category: ACHIEVEMENT_CATEGORIES.STREAK,
        icon: '🔥',
        xp: 70,
        condition: { type: 'streak', value: 7 }
    },
    streak_30: {
        id: 'streak_30',
        name: '🔥🔥🔥 Huyền thoại',
        nameEn: '🔥🔥🔥 Legend',
        description: 'Streak 30 ngày',
        descriptionEn: '30-day streak',
        category: ACHIEVEMENT_CATEGORIES.STREAK,
        icon: '🔥',
        xp: 300,
        condition: { type: 'streak', value: 30 }
    },

    // Gaming achievements
    first_game: {
        id: 'first_game',
        name: '🎮 Gamer mới',
        nameEn: '🎮 New Gamer',
        description: 'Chơi game đầu tiên',
        descriptionEn: 'Play your first game',
        category: ACHIEVEMENT_CATEGORIES.GAMING,
        icon: '🎮',
        xp: 10,
        condition: { type: 'games_played', value: 1 }
    },
    first_win: {
        id: 'first_win',
        name: '🏆 Chiến thắng đầu tiên',
        nameEn: '🏆 First Victory',
        description: 'Thắng ván game đầu tiên',
        descriptionEn: 'Win your first game',
        category: ACHIEVEMENT_CATEGORIES.GAMING,
        icon: '🏆',
        xp: 25,
        condition: { type: 'wins', value: 1 }
    },
    wins_10: {
        id: 'wins_10',
        name: '🥉 Bronze Player',
        nameEn: '🥉 Bronze Player',
        description: 'Thắng 10 ván',
        descriptionEn: 'Win 10 games',
        category: ACHIEVEMENT_CATEGORIES.GAMING,
        icon: '🥉',
        xp: 100,
        condition: { type: 'wins', value: 10 }
    },
    wins_50: {
        id: 'wins_50',
        name: '🥈 Silver Player',
        nameEn: '🥈 Silver Player',
        description: 'Thắng 50 ván',
        descriptionEn: 'Win 50 games',
        category: ACHIEVEMENT_CATEGORIES.GAMING,
        icon: '🥈',
        xp: 300,
        condition: { type: 'wins', value: 50 }
    },
    wins_100: {
        id: 'wins_100',
        name: '🥇 Gold Player',
        nameEn: '🥇 Gold Player',
        description: 'Thắng 100 ván',
        descriptionEn: 'Win 100 games',
        category: ACHIEVEMENT_CATEGORIES.GAMING,
        icon: '🥇',
        xp: 500,
        condition: { type: 'wins', value: 100 }
    },

    // AI achievements
    ai_chat_first: {
        id: 'ai_chat_first',
        name: '🤖 Lần đầu gặp AI',
        nameEn: '🤖 First AI Chat',
        description: 'Chat với AI lần đầu',
        descriptionEn: 'Chat with AI for the first time',
        category: ACHIEVEMENT_CATEGORIES.AI,
        icon: '🤖',
        xp: 15,
        condition: { type: 'ai_chats', value: 1 }
    },
    ai_chat_50: {
        id: 'ai_chat_50',
        name: '💬 Chuyên gia AI',
        nameEn: '💬 AI Expert',
        description: 'Chat với AI 50 lần',
        descriptionEn: 'Chat with AI 50 times',
        category: ACHIEVEMENT_CATEGORIES.AI,
        icon: '💬',
        xp: 100,
        condition: { type: 'ai_chats', value: 50 }
    },
    image_gen: {
        id: 'image_gen',
        name: '🎨 Họa sĩ AI',
        nameEn: '🎨 AI Artist',
        description: 'Tạo ảnh với AI lần đầu',
        descriptionEn: 'Generate your first AI image',
        category: ACHIEVEMENT_CATEGORIES.AI,
        icon: '🎨',
        xp: 30,
        condition: { type: 'images_generated', value: 1 }
    },

    // Crypto achievements
    wallet_registered: {
        id: 'wallet_registered',
        name: '💼 Có ví rồi',
        nameEn: '💼 Wallet Ready',
        description: 'Đăng ký ví đầu tiên',
        descriptionEn: 'Register your first wallet',
        category: ACHIEVEMENT_CATEGORIES.CRYPTO,
        icon: '💼',
        xp: 20,
        condition: { type: 'wallets', value: 1 }
    },
    price_check: {
        id: 'price_check',
        name: '📊 Nhà đầu tư',
        nameEn: '📊 Investor',
        description: 'Check giá token lần đầu',
        descriptionEn: 'Check token price for the first time',
        category: ACHIEVEMENT_CATEGORIES.CRYPTO,
        icon: '📊',
        xp: 10,
        condition: { type: 'price_checks', value: 1 }
    },

    // Social achievements
    group_active: {
        id: 'group_active',
        name: '👥 Thành viên tích cực',
        nameEn: '👥 Active Member',
        description: 'Tương tác trong 5 nhóm',
        descriptionEn: 'Be active in 5 groups',
        category: ACHIEVEMENT_CATEGORIES.SOCIAL,
        icon: '👥',
        xp: 50,
        condition: { type: 'groups_active', value: 5 }
    }
};

/**
 * Get achievement by ID
 */
function getAchievement(achievementId) {
    return ACHIEVEMENTS[achievementId] || null;
}

/**
 * Get all achievements in a category
 */
function getAchievementsByCategory(category) {
    return Object.values(ACHIEVEMENTS).filter((a) => a.category === category);
}

/**
 * Get localized achievement name
 */
function getAchievementName(achievement, lang = 'vi') {
    const isVietnamese = lang === 'vi' || lang.startsWith('vi');
    return isVietnamese ? achievement.name : achievement.nameEn;
}

/**
 * Get localized achievement description
 */
function getAchievementDescription(achievement, lang = 'vi') {
    const isVietnamese = lang === 'vi' || lang.startsWith('vi');
    return isVietnamese ? achievement.description : achievement.descriptionEn;
}

/**
 * Format achievements list for display
 */
function formatAchievementsList(achievements, userAchievements, lang = 'vi') {
    return achievements.map((a) => {
        const unlocked = userAchievements.includes(a.id);
        const status = unlocked ? '✅' : '🔒';
        const name = getAchievementName(a, lang);
        const desc = getAchievementDescription(a, lang);
        return `${status} ${a.icon} ${name}\n   ${desc}\n   🌟 +${a.xp} XP`;
    }).join('\n\n');
}

/**
 * Calculate total XP from achievements
 */
function calculateAchievementXP(achievementIds) {
    return achievementIds.reduce((total, id) => {
        const achievement = ACHIEVEMENTS[id];
        return total + (achievement?.xp || 0);
    }, 0);
}

module.exports = {
    ACHIEVEMENT_CATEGORIES,
    ACHIEVEMENTS,
    getAchievement,
    getAchievementsByCategory,
    getAchievementName,
    getAchievementDescription,
    formatAchievementsList,
    calculateAchievementXP
};
