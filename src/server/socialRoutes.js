/**
 * Social Hub API Routes
 * Handles community feed, posts, comments, likes, follows, profiles
 * File: src/server/socialRoutes.js
 */

const { Router } = require('express');
const { dbRun, dbGet, dbAll } = require('../../db/core');
const logger = require('../core/logger');
const log = logger.child('Social');

function createSocialRoutes() {
    const router = Router();
    const ts = () => Math.floor(Date.now() / 1000);
    const POST_MAX_LENGTH = Number(process.env.SOCIAL_POST_MAX_LENGTH || 2000);
    const TIP_COOLDOWN = Number(process.env.SOCIAL_TIP_COOLDOWN_SECONDS || 30);
    const LEADERBOARD_LIMIT = Number(process.env.SOCIAL_LEADERBOARD_LIMIT || 20);

    // Helper: create notification + broadcast via WS
    const notify = async (userId, type, actorId, postId, data) => {
        if (userId === actorId) return; // don't notify self
        try {
            await dbRun(
                `INSERT INTO hub_notifications (userId, type, actorId, postId, data, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, type, actorId, postId, JSON.stringify(data || {}), ts()]
            );
            try {
                const { broadcastWsEvent } = require('./apiServer');
                broadcastWsEvent('hub_notification', { userId, type, actorId, postId });
            } catch { /* ws may not be ready */ }
        } catch { /* ignore */ }
    };

    // ═══════════ PROFILE ═══════════

    // GET /profile — get own profile
    router.get('/profile', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            let profile = await dbGet(`SELECT * FROM hub_profiles WHERE userId = ?`, [userId]);
            if (!profile) {
                await dbRun(
                    `INSERT INTO hub_profiles (userId, displayName, createdAt, updatedAt) VALUES (?, ?, ?, ?)`,
                    [userId, req.dashboardUser.firstName || 'User', ts(), ts()]
                );
                profile = await dbGet(`SELECT * FROM hub_profiles WHERE userId = ?`, [userId]);
            }
            res.json({ profile });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // GET /profile/:id — get another user's profile
    router.get('/profile/:id', async (req, res) => {
        try {
            const profile = await dbGet(`SELECT * FROM hub_profiles WHERE userId = ?`, [req.params.id]);
            if (!profile) return res.status(404).json({ error: 'Profile not found' });
            // Check if current user follows them
            const viewerId = req.dashboardUser.userId;
            const follow = await dbGet(`SELECT 1 FROM hub_follows WHERE followerId = ? AND followingId = ?`, [viewerId, req.params.id]);
            res.json({ profile, isFollowing: !!follow });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // PUT /profile — update own profile
    router.put('/profile', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const { displayName, bio, avatarUrl, walletAddress } = req.body;
            // Upsert
            await dbRun(
                `INSERT INTO hub_profiles (userId, displayName, bio, avatarUrl, walletAddress, createdAt, updatedAt) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(userId) DO UPDATE SET 
                    displayName = COALESCE(excluded.displayName, displayName),
                    bio = COALESCE(excluded.bio, bio),
                    avatarUrl = COALESCE(excluded.avatarUrl, avatarUrl),
                    walletAddress = COALESCE(excluded.walletAddress, walletAddress),
                    updatedAt = excluded.updatedAt`,
                [userId, displayName || null, bio || null, avatarUrl || null, walletAddress || null, ts(), ts()]
            );
            const profile = await dbGet(`SELECT * FROM hub_profiles WHERE userId = ?`, [userId]);
            res.json({ profile });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ POSTS ═══════════

    // GET /posts — feed (newest, trending, following, mine)
    router.get('/posts', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const { tab = 'newest', limit = 20, offset = 0, community } = req.query;
            const lim = Math.min(Number(limit) || 20, 50);
            const off = Number(offset) || 0;

            let sql, params;
            if (tab === 'mine') {
                sql = `SELECT p.*, hp.displayName, hp.avatarUrl FROM hub_posts p LEFT JOIN hub_profiles hp ON p.userId = hp.userId WHERE p.userId = ? ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`;
                params = [userId, lim, off];
            } else if (tab === 'following') {
                sql = `SELECT p.*, hp.displayName, hp.avatarUrl FROM hub_posts p LEFT JOIN hub_profiles hp ON p.userId = hp.userId WHERE p.userId IN (SELECT followingId FROM hub_follows WHERE followerId = ?) ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`;
                params = [userId, lim, off];
            } else if (tab === 'trending') {
                sql = `SELECT p.*, hp.displayName, hp.avatarUrl FROM hub_posts p LEFT JOIN hub_profiles hp ON p.userId = hp.userId ORDER BY (p.likesCount + p.commentsCount * 2 + p.tipsCount * 5) DESC, p.createdAt DESC LIMIT ? OFFSET ?`;
                params = [lim, off];
            } else if (tab === 'top_tipped') {
                sql = `SELECT p.*, hp.displayName, hp.avatarUrl FROM hub_posts p LEFT JOIN hub_profiles hp ON p.userId = hp.userId WHERE CAST(p.tipsTotal AS REAL) > 0 ORDER BY CAST(p.tipsTotal AS REAL) DESC LIMIT ? OFFSET ?`;
                params = [lim, off];
            } else {
                // newest
                let where = '';
                params = [];
                if (community) { where = `WHERE p.tokenCommunity = ?`; params.push(community); }
                sql = `SELECT p.*, hp.displayName, hp.avatarUrl FROM hub_posts p LEFT JOIN hub_profiles hp ON p.userId = hp.userId ${where} ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`;
                params.push(lim, off);
            }

            const posts = await dbAll(sql, params) || [];

            // Attach whether current user liked each post
            if (posts.length > 0) {
                const ids = posts.map(p => p.id);
                const placeholders = ids.map(() => '?').join(',');
                const likes = await dbAll(
                    `SELECT postId FROM hub_likes WHERE userId = ? AND postId IN (${placeholders})`,
                    [userId, ...ids]
                ) || [];
                const likedSet = new Set(likes.map(l => l.postId));
                posts.forEach(p => { p.isLiked = likedSet.has(p.id); });
            }

            res.json({ posts, hasMore: posts.length === lim });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST /posts — create post
    router.post('/posts', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const { content, mediaUrls, tokenCommunity, postType } = req.body;
            if (!content?.trim() && (!mediaUrls || !mediaUrls.length)) {
                return res.status(400).json({ error: 'Content or media required' });
            }
            if (content && content.trim().length > POST_MAX_LENGTH) {
                return res.status(400).json({ error: `Content exceeds ${POST_MAX_LENGTH} characters` });
            }
            const now = ts();
            const result = await dbRun(
                `INSERT INTO hub_posts (userId, content, mediaUrls, tokenCommunity, postType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, content?.trim() || '', JSON.stringify(mediaUrls || []), tokenCommunity || null, postType || 'text', now, now]
            );
            const post = await dbGet(`SELECT p.*, hp.displayName, hp.avatarUrl FROM hub_posts p LEFT JOIN hub_profiles hp ON p.userId = hp.userId WHERE p.id = ?`, [result?.lastID || 0]);
            // Broadcast new post via WS
            try {
                const { broadcastWsEvent } = require('./apiServer');
                broadcastWsEvent('hub_new_post', { postId: post?.id, userId });
            } catch { /* ignore */ }
            res.json({ post });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // DELETE /posts/:id — delete own post
    router.delete('/posts/:id', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const post = await dbGet(`SELECT * FROM hub_posts WHERE id = ? AND userId = ?`, [req.params.id, userId]);
            if (!post) return res.status(404).json({ error: 'Post not found or not yours' });
            await dbRun(`DELETE FROM hub_posts WHERE id = ?`, [req.params.id]);
            await dbRun(`DELETE FROM hub_comments WHERE postId = ?`, [req.params.id]);
            await dbRun(`DELETE FROM hub_likes WHERE postId = ?`, [req.params.id]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ LIKES ═══════════

    // POST /posts/:id/like — toggle like
    router.post('/posts/:id/like', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const postId = req.params.id;
            const existing = await dbGet(`SELECT 1 FROM hub_likes WHERE postId = ? AND userId = ?`, [postId, userId]);
            if (existing) {
                await dbRun(`DELETE FROM hub_likes WHERE postId = ? AND userId = ?`, [postId, userId]);
                await dbRun(`UPDATE hub_posts SET likesCount = MAX(0, likesCount - 1) WHERE id = ?`, [postId]);
                res.json({ liked: false });
            } else {
                await dbRun(`INSERT INTO hub_likes (postId, userId, createdAt) VALUES (?, ?, ?)`, [postId, userId, ts()]);
                await dbRun(`UPDATE hub_posts SET likesCount = likesCount + 1 WHERE id = ?`, [postId]);
                // Notify post author
                const post = await dbGet(`SELECT userId FROM hub_posts WHERE id = ?`, [postId]);
                if (post) await notify(post.userId, 'like', userId, Number(postId));
                res.json({ liked: true });
            }
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ COMMENTS ═══════════

    // GET /posts/:id/comments
    router.get('/posts/:id/comments', async (req, res) => {
        try {
            const comments = await dbAll(
                `SELECT c.*, hp.displayName, hp.avatarUrl FROM hub_comments c LEFT JOIN hub_profiles hp ON c.userId = hp.userId WHERE c.postId = ? ORDER BY c.createdAt ASC LIMIT 100`,
                [req.params.id]
            ) || [];
            res.json({ comments });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST /posts/:id/comments
    router.post('/posts/:id/comments', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const { content, parentId } = req.body;
            if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
            const postId = req.params.id;
            await dbRun(
                `INSERT INTO hub_comments (postId, userId, content, parentId, createdAt) VALUES (?, ?, ?, ?, ?)`,
                [postId, userId, content.trim(), parentId || null, ts()]
            );
            await dbRun(`UPDATE hub_posts SET commentsCount = commentsCount + 1, updatedAt = ? WHERE id = ?`, [ts(), postId]);
            // Notify post author
            const post = await dbGet(`SELECT userId FROM hub_posts WHERE id = ?`, [postId]);
            if (post) await notify(post.userId, 'comment', userId, Number(postId), { preview: content.trim().slice(0, 80) });
            const comments = await dbAll(
                `SELECT c.*, hp.displayName, hp.avatarUrl FROM hub_comments c LEFT JOIN hub_profiles hp ON c.userId = hp.userId WHERE c.postId = ? ORDER BY c.createdAt ASC LIMIT 100`,
                [postId]
            ) || [];
            res.json({ comments });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ FOLLOW ═══════════

    // POST /follow/:id — toggle follow
    router.post('/follow/:id', async (req, res) => {
        try {
            const followerId = req.dashboardUser.userId;
            const followingId = req.params.id;
            if (followerId === followingId) return res.status(400).json({ error: 'Cannot follow yourself' });
            const existing = await dbGet(`SELECT 1 FROM hub_follows WHERE followerId = ? AND followingId = ?`, [followerId, followingId]);
            if (existing) {
                await dbRun(`DELETE FROM hub_follows WHERE followerId = ? AND followingId = ?`, [followerId, followingId]);
                await dbRun(`UPDATE hub_profiles SET followersCount = MAX(0, followersCount - 1) WHERE userId = ?`, [followingId]);
                await dbRun(`UPDATE hub_profiles SET followingCount = MAX(0, followingCount - 1) WHERE userId = ?`, [followerId]);
                res.json({ following: false });
            } else {
                await dbRun(`INSERT INTO hub_follows (followerId, followingId, createdAt) VALUES (?, ?, ?)`, [followerId, followingId, ts()]);
                await dbRun(`UPDATE hub_profiles SET followersCount = followersCount + 1 WHERE userId = ?`, [followingId]);
                await dbRun(`UPDATE hub_profiles SET followingCount = followingCount + 1 WHERE userId = ?`, [followerId]);
                await notify(followingId, 'follow', followerId, null);
                res.json({ following: true });
            }
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ NOTIFICATIONS ═══════════

    // GET /notifications
    router.get('/notifications', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const limit = Math.min(Number(req.query.limit) || 30, 50);
            const notifs = await dbAll(
                `SELECT n.*, hp.displayName AS actorName, hp.avatarUrl AS actorAvatar FROM hub_notifications n LEFT JOIN hub_profiles hp ON n.actorId = hp.userId WHERE n.userId = ? ORDER BY n.createdAt DESC LIMIT ?`,
                [userId, limit]
            ) || [];
            const unread = await dbGet(`SELECT COUNT(*) as c FROM hub_notifications WHERE userId = ? AND read = 0`, [userId]);
            res.json({ notifications: notifs, unreadCount: unread?.c || 0 });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST /notifications/read — mark all as read
    router.post('/notifications/read', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            await dbRun(`UPDATE hub_notifications SET read = 1 WHERE userId = ? AND read = 0`, [userId]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ LEADERBOARD ═══════════

    // GET /leaderboard
    router.get('/leaderboard', async (req, res) => {
        try {
            const creators = await dbAll(
                `SELECT userId, displayName, avatarUrl, reputation, totalTipsReceived, followersCount 
                 FROM hub_profiles 
                 ORDER BY CAST(totalTipsReceived AS REAL) DESC, followersCount DESC 
                 LIMIT ?`
            , [LEADERBOARD_LIMIT]) || [];
            res.json({ leaderboard: creators });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ TIPS (record only, execution via marketRoutes) ═══════════

    // POST /tips — record a tip
    router.post('/tips', async (req, res) => {
        try {
            const fromUserId = req.dashboardUser.userId;
            const { postId, toUserId, tokenAddress, tokenSymbol, amount, txHash, chainIndex } = req.body;
            if (!toUserId || !amount) return res.status(400).json({ error: 'toUserId and amount required' });
            // Cooldown check
            const lastTip = await dbGet(`SELECT createdAt FROM hub_tips WHERE fromUserId = ? AND toUserId = ? ORDER BY createdAt DESC LIMIT 1`, [fromUserId, toUserId]);
            if (lastTip && (ts() - lastTip.createdAt) < TIP_COOLDOWN) {
                return res.status(429).json({ error: `Please wait ${TIP_COOLDOWN}s between tips to the same user` });
            }
            await dbRun(
                `INSERT INTO hub_tips (postId, fromUserId, toUserId, tokenAddress, tokenSymbol, amount, txHash, chainIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [postId || null, fromUserId, toUserId, tokenAddress || null, tokenSymbol || 'OKB', amount, txHash || null, chainIndex || '196', ts()]
            );
            // Update post tip count
            if (postId) {
                await dbRun(`UPDATE hub_posts SET tipsCount = tipsCount + 1, tipsTotal = CAST(CAST(tipsTotal AS REAL) + ? AS TEXT) WHERE id = ?`, [Number(amount) || 0, postId]);
            }
            // Update profiles
            await dbRun(`UPDATE hub_profiles SET totalTipsGiven = CAST(CAST(totalTipsGiven AS REAL) + ? AS TEXT), updatedAt = ? WHERE userId = ?`, [Number(amount) || 0, ts(), fromUserId]);
            await dbRun(`UPDATE hub_profiles SET totalTipsReceived = CAST(CAST(totalTipsReceived AS REAL) + ? AS TEXT), reputation = reputation + 1, updatedAt = ? WHERE userId = ?`, [Number(amount) || 0, ts(), toUserId]);
            await notify(toUserId, 'tip', fromUserId, postId ? Number(postId) : null, { amount, tokenSymbol: tokenSymbol || 'OKB' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ DIRECT MESSAGES ═══════════

    // GET /messages/unread — total unread DM count
    router.get('/messages/unread', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const row = await dbGet(`SELECT COUNT(*) as c FROM hub_messages WHERE toUserId = ? AND readAt IS NULL`, [userId]);
            res.json({ unreadCount: row?.c || 0 });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // GET /messages/conversations — list DM partners
    router.get('/messages/conversations', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            // Get latest message per conversation partner
            const conversations = await dbAll(`
                SELECT 
                    CASE WHEN m.fromUserId = ? THEN m.toUserId ELSE m.fromUserId END AS partnerId,
                    MAX(m.id) as lastMsgId,
                    MAX(m.createdAt) as lastMsgAt,
                    SUM(CASE WHEN m.toUserId = ? AND m.readAt IS NULL THEN 1 ELSE 0 END) as unreadCount
                FROM hub_messages m
                WHERE m.fromUserId = ? OR m.toUserId = ?
                GROUP BY partnerId
                ORDER BY lastMsgAt DESC
                LIMIT 50
            `, [userId, userId, userId, userId]) || [];

            // Enrich with profile + last message content
            const enriched = await Promise.all(conversations.map(async (c) => {
                const profile = await dbGet(`SELECT displayName, avatarUrl FROM hub_profiles WHERE userId = ?`, [c.partnerId]);
                const lastMsg = await dbGet(`SELECT content, fromUserId FROM hub_messages WHERE id = ?`, [c.lastMsgId]);
                return {
                    partnerId: c.partnerId,
                    displayName: profile?.displayName || `User ${String(c.partnerId).slice(-4)}`,
                    avatarUrl: profile?.avatarUrl || null,
                    lastMessage: lastMsg?.content?.slice(0, 60) || '',
                    lastMessageIsOwn: lastMsg?.fromUserId === userId,
                    lastMessageAt: c.lastMsgAt,
                    unreadCount: c.unreadCount || 0,
                };
            }));
            res.json({ conversations: enriched });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // GET /messages/:userId — get messages with a user
    router.get('/messages/:userId', async (req, res) => {
        try {
            const userId = req.dashboardUser.userId;
            const partnerId = req.params.userId;
            const limit = Math.min(Number(req.query.limit) || 50, 100);
            const messages = await dbAll(`
                SELECT * FROM hub_messages 
                WHERE (fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?)
                ORDER BY createdAt DESC LIMIT ?
            `, [userId, partnerId, partnerId, userId, limit]) || [];
            // Mark as read
            await dbRun(`UPDATE hub_messages SET readAt = ? WHERE toUserId = ? AND fromUserId = ? AND readAt IS NULL`, [ts(), userId, partnerId]);
            res.json({ messages: messages.reverse() });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST /messages/:userId — send DM
    router.post('/messages/:userId', async (req, res) => {
        try {
            const fromUserId = req.dashboardUser.userId;
            const toUserId = req.params.userId;
            const { content } = req.body;
            if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
            if (fromUserId === toUserId) return res.status(400).json({ error: 'Cannot message yourself' });
            await dbRun(
                `INSERT INTO hub_messages (fromUserId, toUserId, content, createdAt) VALUES (?, ?, ?, ?)`,
                [fromUserId, toUserId, content.trim(), ts()]
            );
            await notify(toUserId, 'message', fromUserId, null, { preview: content.trim().slice(0, 60) });
            // Broadcast via WS
            try {
                const { broadcastWsEvent } = require('./apiServer');
                broadcastWsEvent('hub_dm', { toUserId, fromUserId });
            } catch { /* ignore */ }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════ SINGLE POST ═══════════

    // GET /posts/:id — single post (for notification links)
    router.get('/posts/:id', async (req, res) => {
        try {
            const post = await dbGet(
                `SELECT p.*, hp.displayName, hp.avatarUrl FROM hub_posts p LEFT JOIN hub_profiles hp ON p.userId = hp.userId WHERE p.id = ?`,
                [req.params.id]
            );
            if (!post) return res.status(404).json({ error: 'Post not found' });
            const userId = req.dashboardUser.userId;
            const like = await dbGet(`SELECT 1 FROM hub_likes WHERE postId = ? AND userId = ?`, [post.id, userId]);
            post.isLiked = !!like;
            res.json({ post });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
}

module.exports = { createSocialRoutes };
