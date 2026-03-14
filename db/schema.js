/**
 * Database Schema Module
 * Handles database initialization with all table CREATE statements
 * File: db/schema.js
 */

const { dbRun } = require('./core');

async function init() {
    console.log("Đang khởi tạo cấu trúc bảng SQLite...");

    // Users table
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
        chatId TEXT PRIMARY KEY,
        lang TEXT,
        lang_source TEXT DEFAULT 'auto',
        wallets TEXT DEFAULT '[]',
        username TEXT,
        firstName TEXT,
        lastName TEXT,
        fullName TEXT,
        firstSeen INTEGER,
        lastSeen INTEGER
    )`);

    // Migration for PIN code
    try {
        await dbRun(`ALTER TABLE users ADD COLUMN pinCode TEXT`);
    } catch (e) { /* Column likely exists already */ }

    // Group subscriptions
    await dbRun(`CREATE TABLE IF NOT EXISTS group_subscriptions (
        chatId TEXT PRIMARY KEY,
        lang TEXT,
        minStake REAL,
        messageThreadId TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Group member languages
    await dbRun(`CREATE TABLE IF NOT EXISTS group_member_languages (
        groupChatId TEXT,
        userId TEXT,
        lang TEXT,
        updatedAt INTEGER,
        PRIMARY KEY (groupChatId, userId)
    )`);

    // Group bot settings
    await dbRun(`CREATE TABLE IF NOT EXISTS group_bot_settings (
        chatId TEXT PRIMARY KEY,
        settings TEXT DEFAULT '{}',
        updatedAt INTEGER
    )`);

    // Group profiles
    await dbRun(`CREATE TABLE IF NOT EXISTS group_profiles (
        chatId TEXT PRIMARY KEY,
        title TEXT,
        type TEXT,
        memberCount INTEGER,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Filters
    await dbRun(`CREATE TABLE IF NOT EXISTS group_filters (
        chatId TEXT,
        keyword TEXT,
        responseText TEXT,
        entities TEXT DEFAULT '[]',
        updatedAt INTEGER,
        PRIMARY KEY (chatId, keyword)
    )`);

    // Group activity log
    await dbRun(`CREATE TABLE IF NOT EXISTS group_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        action TEXT,
        details TEXT,
        userId TEXT,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_group_activity_log_chatId ON group_activity_log(chatId)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_group_activity_log_time ON group_activity_log(createdAt DESC)`);

    // User wallet tokens
    await dbRun(`CREATE TABLE IF NOT EXISTS user_wallet_tokens (
        chatId TEXT,
        walletAddress TEXT,
        tokenKey TEXT,
        tokenLabel TEXT,
        tokenAddress TEXT,
        quoteTargets TEXT DEFAULT '["USDT","OKB"]',
        createdAt INTEGER,
        updatedAt INTEGER,
        PRIMARY KEY (chatId, walletAddress, tokenKey)
    )`);

    // Wallet holdings cache
    await dbRun(`CREATE TABLE IF NOT EXISTS wallet_holdings_cache (
        chatId TEXT,
        walletAddress TEXT,
        tokens TEXT DEFAULT '[]',
        updatedAt INTEGER,
        PRIMARY KEY (chatId, walletAddress)
    )`);

    // User warnings
    await dbRun(`CREATE TABLE IF NOT EXISTS user_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        targetUserId TEXT,
        targetUsername TEXT,
        reason TEXT,
        createdBy TEXT,
        createdAt INTEGER
    )`);

    // Pending memes
    await dbRun(`CREATE TABLE IF NOT EXISTS pending_memes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        authorId TEXT,
        content TEXT,
        status TEXT DEFAULT 'pending',
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Checkin groups
    await dbRun(`CREATE TABLE IF NOT EXISTS checkin_groups (
        chatId TEXT PRIMARY KEY,
        checkinTime TEXT DEFAULT '08:00',
        timezone TEXT DEFAULT 'UTC',
        autoMessageEnabled INTEGER DEFAULT 1,
        dailyPoints INTEGER DEFAULT 10,
        summaryWindow INTEGER DEFAULT 7,
        mathWeight INTEGER DEFAULT 2,
        physicsWeight INTEGER DEFAULT 1,
        chemistryWeight INTEGER DEFAULT 1,
        okxWeight INTEGER DEFAULT 1,
        cryptoWeight INTEGER DEFAULT 1,
        autoMessageTimes TEXT DEFAULT '["08:00"]',
        summaryMessageEnabled INTEGER DEFAULT 0,
        summaryMessageTimes TEXT DEFAULT '[]',
        leaderboardPeriodStart TEXT,
        summaryPeriodStart TEXT,
        promptTemplate TEXT DEFAULT '',
        lastAutoMessageDate TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Checkin members
    await dbRun(`CREATE TABLE IF NOT EXISTS checkin_members (
        chatId TEXT,
        userId TEXT,
        streak INTEGER DEFAULT 0,
        longestStreak INTEGER DEFAULT 0,
        totalCheckins INTEGER DEFAULT 0,
        totalPoints INTEGER DEFAULT 0,
        lastCheckinDate TEXT,
        lockedUntilDate TEXT,
        createdAt INTEGER,
        updatedAt INTEGER,
        PRIMARY KEY (chatId, userId)
    )`);

    // Checkin records
    await dbRun(`CREATE TABLE IF NOT EXISTS checkin_records (
        id TEXT PRIMARY KEY,
        chatId TEXT,
        userId TEXT,
        checkinDate TEXT,
        walletAddress TEXT,
        pointsAwarded INTEGER DEFAULT 0,
        emotion TEXT,
        goal TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Checkin attempts
    await dbRun(`CREATE TABLE IF NOT EXISTS checkin_attempts (
        chatId TEXT,
        userId TEXT,
        checkinDate TEXT,
        attempts INTEGER DEFAULT 0,
        locked INTEGER DEFAULT 0,
        updatedAt INTEGER,
        PRIMARY KEY (chatId, userId, checkinDate)
    )`);

    // Checkin auto logs
    await dbRun(`CREATE TABLE IF NOT EXISTS checkin_auto_logs (
        chatId TEXT,
        checkinDate TEXT,
        slot TEXT,
        sentAt INTEGER,
        PRIMARY KEY (chatId, checkinDate, slot)
    )`);

    // Checkin summary logs
    await dbRun(`CREATE TABLE IF NOT EXISTS checkin_summary_logs (
        chatId TEXT,
        summaryDate TEXT,
        slot TEXT,
        sentAt INTEGER,
        PRIMARY KEY (chatId, summaryDate, slot)
    )`);

    // Co-owners
    await dbRun(`CREATE TABLE IF NOT EXISTS co_owners (
        userId TEXT PRIMARY KEY,
        username TEXT,
        firstName TEXT,
        addedBy TEXT,
        addedAt INTEGER
    )`);

    // Banned users
    await dbRun(`CREATE TABLE IF NOT EXISTS banned_users (
        userId TEXT PRIMARY KEY,
        username TEXT,
        firstName TEXT,
        reason TEXT,
        bannedBy TEXT,
        bannedAt INTEGER
    )`);

    // User devices
    await dbRun(`CREATE TABLE IF NOT EXISTS user_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        deviceId TEXT UNIQUE,
        deviceModel TEXT,
        osVersion TEXT,
        appVersion TEXT,
        ipAddress TEXT,
        firstSeen INTEGER,
        lastSeen INTEGER
    )`);

    // Banned devices
    await dbRun(`CREATE TABLE IF NOT EXISTS banned_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId TEXT UNIQUE,
        userId TEXT,
        reason TEXT,
        bannedBy TEXT,
        bannedAt INTEGER
    )`);

    // Command limits
    await dbRun(`CREATE TABLE IF NOT EXISTS command_limits (
        command TEXT,
        targetId TEXT,
        limitValue INTEGER,
        updatedAt INTEGER,
        PRIMARY KEY (command, targetId)
    )`);

    // Command usage logs
    await dbRun(`CREATE TABLE IF NOT EXISTS command_usage_logs (
        userId TEXT,
        command TEXT,
        usageDate TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (userId, command, usageDate)
    )`);

    // Group command usage logs
    await dbRun(`CREATE TABLE IF NOT EXISTS group_command_usage_logs (
        chatId TEXT,
        command TEXT,
        usageDate TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (chatId, command, usageDate)
    )`);

    // User AI keys
    await dbRun(`CREATE TABLE IF NOT EXISTS user_ai_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        name TEXT,
        apiKey TEXT,
        provider TEXT DEFAULT 'google',
        createdAt INTEGER
    )`);

    // User AI preferences
    await dbRun(`CREATE TABLE IF NOT EXISTS user_ai_preferences (
        userId TEXT PRIMARY KEY,
        provider TEXT,
        modelFamily TEXT,
        thinkingLevel TEXT,
        preferredKeyIndex INTEGER DEFAULT 0,
        updatedAt INTEGER
    )`);

    // API key blocks
    await dbRun(`CREATE TABLE IF NOT EXISTS api_key_blocks (
        userId TEXT PRIMARY KEY,
        reason TEXT,
        addedBy TEXT,
        createdAt INTEGER
    )`);

    // User AI memory
    await dbRun(`CREATE TABLE IF NOT EXISTS user_ai_memory (
        userId TEXT PRIMARY KEY,
        userName TEXT,
        userPreferences TEXT DEFAULT '{}',
        conversationSummary TEXT,
        persona TEXT DEFAULT 'default',
        lastContext TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // User TTS settings
    await dbRun(`CREATE TABLE IF NOT EXISTS user_tts_settings (
        userId TEXT PRIMARY KEY,
        voice TEXT,
        language TEXT,
        updatedAt INTEGER
    )`);

    // Price alert tokens
    await dbRun(`CREATE TABLE IF NOT EXISTS price_alert_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        tokenAddress TEXT,
        tokenLabel TEXT,
        customTitle TEXT,
        chainIndex INTEGER,
        chainShortName TEXT,
        intervalSeconds INTEGER DEFAULT 300,
        enabled INTEGER DEFAULT 1,
        lastRunAt INTEGER,
        nextRunAt INTEGER,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Price alert media attachments
    await dbRun(`CREATE TABLE IF NOT EXISTS price_alert_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tokenId INTEGER,
        chatId TEXT,
        mediaType TEXT,
        fileId TEXT,
        createdAt INTEGER
    )`);

    // Price alert custom titles
    await dbRun(`CREATE TABLE IF NOT EXISTS price_alert_titles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tokenId INTEGER,
        chatId TEXT,
        title TEXT,
        createdAt INTEGER
    )`);

    // Price alert targets
    await dbRun(`CREATE TABLE IF NOT EXISTS price_alert_targets (
        chatId TEXT PRIMARY KEY,
        topicId TEXT,
        updatedAt INTEGER
    )`);

    // Topic languages
    await dbRun(`CREATE TABLE IF NOT EXISTS topic_languages (
        chatId TEXT,
        topicId TEXT,
        lang TEXT,
        updatedAt INTEGER,
        PRIMARY KEY (chatId, topicId)
    )`);

    // Feature topics
    await dbRun(`CREATE TABLE IF NOT EXISTS feature_topics (
        chatId TEXT,
        feature TEXT,
        topicId TEXT,
        updatedAt INTEGER,
        PRIMARY KEY (chatId, feature, topicId)
    )`);

    // Price alert token topics
    await dbRun(`CREATE TABLE IF NOT EXISTS price_alert_token_topics (
        tokenId INTEGER,
        chatId TEXT,
        topicId TEXT,
        enabled INTEGER DEFAULT 1,
        updatedAt INTEGER,
        PRIMARY KEY (tokenId, topicId)
    )`);

    // Daily challenges
    await dbRun(`CREATE TABLE IF NOT EXISTS daily_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        userId TEXT,
        challengeDate TEXT,
        challengeType TEXT,
        progress INTEGER DEFAULT 0,
        target INTEGER DEFAULT 1,
        completed INTEGER DEFAULT 0,
        pointsAwarded INTEGER DEFAULT 0,
        xpAwarded INTEGER DEFAULT 0,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Global leaderboard
    await dbRun(`CREATE TABLE IF NOT EXISTS global_leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        userName TEXT,
        gameType TEXT,
        score INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        bestScore INTEGER,
        bestTime INTEGER,
        gamesPlayed INTEGER DEFAULT 0,
        lastPlayedAt INTEGER,
        createdAt INTEGER,
        updatedAt INTEGER,
        UNIQUE(userId, gameType)
    )`);

    // User achievements
    await dbRun(`CREATE TABLE IF NOT EXISTS user_achievements (
        userId TEXT,
        achievementId TEXT,
        unlockedAt INTEGER,
        PRIMARY KEY (userId, achievementId)
    )`);

    // User stats
    await dbRun(`CREATE TABLE IF NOT EXISTS user_stats (
        userId TEXT PRIMARY KEY,
        totalXP INTEGER DEFAULT 0,
        checkinCount INTEGER DEFAULT 0,
        gamesPlayed INTEGER DEFAULT 0,
        gamesWon INTEGER DEFAULT 0,
        aiChats INTEGER DEFAULT 0,
        imagesGenerated INTEGER DEFAULT 0,
        priceChecks INTEGER DEFAULT 0,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Scheduled posts
    await dbRun(`CREATE TABLE IF NOT EXISTS scheduled_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        topicId TEXT,
        content TEXT,
        mediaType TEXT,
        mediaFileId TEXT,
        scheduleTime TEXT,
        repeatType TEXT DEFAULT 'none',
        timezone TEXT DEFAULT 'UTC',
        enabled INTEGER DEFAULT 1,
        lastRunAt INTEGER,
        nextRunAt INTEGER,
        createdBy TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Pending tokens
    await dbRun(`CREATE TABLE IF NOT EXISTS pending_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        tokenAddress TEXT,
        tokenSymbol TEXT,
        status TEXT DEFAULT 'pending',
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Game stats
    await dbRun(`CREATE TABLE IF NOT EXISTS game_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chatId TEXT,
        userId TEXT,
        gameType TEXT,
        score INTEGER DEFAULT 0,
        createdAt INTEGER
    )`);

    // User price alerts (AI-driven)
    await dbRun(`CREATE TABLE IF NOT EXISTS user_price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        chatId TEXT NOT NULL,
        symbol TEXT NOT NULL,
        chainIndex TEXT,
        tokenAddress TEXT,
        targetPrice REAL NOT NULL,
        direction TEXT NOT NULL DEFAULT 'above',
        active INTEGER DEFAULT 1,
        createdAt INTEGER DEFAULT (strftime('%s','now')),
        triggeredAt INTEGER
    )`);

    // User favorite tokens
    await dbRun(`CREATE TABLE IF NOT EXISTS user_favorite_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        symbol TEXT NOT NULL,
        chainIndex TEXT,
        tokenAddress TEXT,
        fullName TEXT,
        addedAt INTEGER DEFAULT (strftime('%s','now')),
        UNIQUE(userId, symbol, chainIndex)
    )`);

    // User game rewards (P2E)
    await dbRun(`CREATE TABLE IF NOT EXISTS user_game_rewards (
        userId TEXT PRIMARY KEY,
        points INTEGER DEFAULT 0,
        totalRedeemed REAL DEFAULT 0,
        lastRedeemAt INTEGER
    )`);

    // User trading wallets (encrypted private keys for auto-swap)
    await dbRun(`CREATE TABLE IF NOT EXISTS user_trading_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        walletName TEXT,
        address TEXT NOT NULL,
        encryptedKey TEXT NOT NULL,
        chainIndex TEXT DEFAULT '196',
        isDefault INTEGER DEFAULT 0,
        createdAt INTEGER
    )`);

    // AI Scheduled Tasks (persistent scheduler for AI agent)
    await dbRun(`CREATE TABLE IF NOT EXISTS ai_scheduled_tasks (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        chatId TEXT NOT NULL,
        type TEXT NOT NULL,
        intervalMs INTEGER NOT NULL,
        nextRunAt INTEGER NOT NULL,
        params TEXT DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        lang TEXT DEFAULT 'vi',
        lastPrice REAL,
        lastTotalUsd REAL,
        createdAt INTEGER NOT NULL
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_ai_tasks_next ON ai_scheduled_tasks(nextRunAt, enabled)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_ai_tasks_user ON ai_scheduled_tasks(userId)`);

    // Wallet transaction history (PnL tracker)
    await dbRun(`CREATE TABLE IF NOT EXISTS wallet_tx_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        walletId INTEGER,
        walletAddress TEXT,
        type TEXT NOT NULL,
        chainIndex TEXT DEFAULT '196',
        fromToken TEXT, toToken TEXT,
        fromAmount TEXT, toAmount TEXT,
        fromSymbol TEXT, toSymbol TEXT,
        priceUsd REAL,
        gasUsed TEXT,
        txHash TEXT,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_tx_history_user ON wallet_tx_history(userId)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_tx_history_wallet ON wallet_tx_history(walletId)`);

    // Wallet whitelist (trusted addresses)
    await dbRun(`CREATE TABLE IF NOT EXISTS wallet_whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        address TEXT NOT NULL,
        label TEXT,
        createdAt INTEGER,
        UNIQUE(userId, address)
    )`);

    // Migration: add tags column to trading wallets
    try {
        await dbRun(`ALTER TABLE user_trading_wallets ADD COLUMN tags TEXT DEFAULT ''`);
    } catch (e) { /* Column likely exists already */ }

    // Migration: add lastExportedAt for backup reminder
    try {
        await dbRun(`ALTER TABLE user_trading_wallets ADD COLUMN lastExportedAt INTEGER DEFAULT 0`);
    } catch (e) { /* Column likely exists already */ }

    // Migration: add walletLimit to users for owner-controlled limit
    try {
        await dbRun(`ALTER TABLE users ADD COLUMN walletLimit INTEGER DEFAULT 50`);
    } catch (e) { /* Column likely exists already */ }

    // Portfolio snapshots for chart
    await dbRun(`CREATE TABLE IF NOT EXISTS wallet_portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        totalUsd REAL DEFAULT 0,
        snapshotAt INTEGER NOT NULL
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_portfolio_snap_user ON wallet_portfolio_snapshots(userId, snapshotAt DESC)`);

    // User OKX CEX API keys (encrypted per user)
    await dbRun(`CREATE TABLE IF NOT EXISTS user_okx_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT UNIQUE NOT NULL,
        encApiKey TEXT NOT NULL,
        encSecretKey TEXT NOT NULL,
        encPassphrase TEXT NOT NULL,
        demo INTEGER DEFAULT 1,
        site TEXT DEFAULT 'global',
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Web chat sessions (persistent dashboard AI chat history)
    await dbRun(`CREATE TABLE IF NOT EXISTS web_chat_sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        title TEXT DEFAULT 'New Chat',
        messages TEXT DEFAULT '[]',
        createdAt INTEGER,
        updatedAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_web_chat_user ON web_chat_sessions(userId, updatedAt DESC)`);

    // Wallet templates (named address lists for batch operations)
    await dbRun(`CREATE TABLE IF NOT EXISTS wallet_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        addresses TEXT NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER,
        UNIQUE(userId, name)
    )`);

    // User preferences — long-term AI memory (#12)
    await dbRun(`CREATE TABLE IF NOT EXISTS user_preferences (
        userId TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updatedAt INTEGER,
        PRIMARY KEY (userId, key)
    )`);

    // Trade history — uses unified swap_history table (in tradingTools.js) with priceUsd column
    // swap_history is created at swap-time with CREATE TABLE IF NOT EXISTS

    // Scheduled reports (#13)
    await dbRun(`CREATE TABLE IF NOT EXISTS scheduled_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        frequency TEXT NOT NULL,
        time TEXT DEFAULT '09:00',
        active INTEGER DEFAULT 1,
        lastRun INTEGER,
        createdAt INTEGER
    )`);


    // ═══════════════════════════════════════════
    // Social Hub Tables (Community Trading Hub)
    // ═══════════════════════════════════════════

    // Hub user profiles (extends Telegram user data)
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_profiles (
        userId TEXT PRIMARY KEY,
        displayName TEXT,
        bio TEXT,
        avatarUrl TEXT,
        walletAddress TEXT,
        reputation INTEGER DEFAULT 0,
        totalTipsGiven TEXT DEFAULT '0',
        totalTipsReceived TEXT DEFAULT '0',
        followersCount INTEGER DEFAULT 0,
        followingCount INTEGER DEFAULT 0,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);

    // Hub posts (community feed)
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        content TEXT,
        mediaUrls TEXT DEFAULT '[]',
        tokenCommunity TEXT,
        postType TEXT DEFAULT 'text',
        likesCount INTEGER DEFAULT 0,
        commentsCount INTEGER DEFAULT 0,
        tipsCount INTEGER DEFAULT 0,
        tipsTotal TEXT DEFAULT '0',
        pinned INTEGER DEFAULT 0,
        createdAt INTEGER,
        updatedAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_posts_user ON hub_posts(userId, createdAt DESC)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_posts_time ON hub_posts(createdAt DESC)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_posts_community ON hub_posts(tokenCommunity, createdAt DESC)`);

    // Hub comments
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        userId TEXT NOT NULL,
        content TEXT NOT NULL,
        parentId INTEGER,
        likesCount INTEGER DEFAULT 0,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_comments_post ON hub_comments(postId, createdAt ASC)`);

    // Hub likes
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_likes (
        postId INTEGER NOT NULL,
        userId TEXT NOT NULL,
        createdAt INTEGER,
        PRIMARY KEY (postId, userId)
    )`);

    // Hub follows
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_follows (
        followerId TEXT NOT NULL,
        followingId TEXT NOT NULL,
        createdAt INTEGER,
        PRIMARY KEY (followerId, followingId)
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_follows_following ON hub_follows(followingId)`);

    // Hub tips (multi-token)
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_tips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER,
        fromUserId TEXT NOT NULL,
        toUserId TEXT NOT NULL,
        tokenAddress TEXT,
        tokenSymbol TEXT DEFAULT 'OKB',
        amount TEXT NOT NULL,
        txHash TEXT,
        chainIndex TEXT DEFAULT '196',
        createdAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_tips_to ON hub_tips(toUserId, createdAt DESC)`);

    // Hub messages (DM)
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fromUserId TEXT NOT NULL,
        toUserId TEXT NOT NULL,
        content TEXT NOT NULL,
        readAt INTEGER,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_messages_conv ON hub_messages(fromUserId, toUserId, createdAt DESC)`);

    // Hub notifications
    await dbRun(`CREATE TABLE IF NOT EXISTS hub_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        actorId TEXT,
        postId INTEGER,
        data TEXT DEFAULT '{}',
        read INTEGER DEFAULT 0,
        createdAt INTEGER
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_hub_notif_user ON hub_notifications(userId, read, createdAt DESC)`);

    console.log("Khởi tạo cấu trúc bảng SQLite hoàn tất.");
}

module.exports = { init };
