/**
 * Database Module Index
 * Re-exports all database modules for unified import
 * File: db/index.js
 * 
 * Usage:
 *   const db = require('./db');
 *   // or
 *   const { getCheckinGroup, getUserLanguage } = require('./db');
 */

const core = require('./core');
const checkin = require('./checkin');
const users = require('./users');
const wallets = require('./wallets');
const groups = require('./groups');
const moderation = require('./moderation');
const priceAlerts = require('./priceAlerts');
const topics = require('./topics');
const ai = require('./ai');
const commandUsage = require('./commandUsage');
const games = require('./games');
const scheduledPosts = require('./scheduledPosts');
const preferences = require('./preferences');
const tradeHistory = require('./tradeHistory');
const scheduledReports = require('./scheduledReports');
const welcomeAdmissions = require('./welcomeAdmissions');
const schema = require('./schema');
const aiConversations = require('./aiConversations');

module.exports = {
    // Core - Database connection and helpers
    ...core,

    // Checkin - ~45 functions
    ...checkin,

    // Users - ~25 functions
    ...users,

    // Wallets - ~20 functions
    ...wallets,

    // Groups - ~20 functions
    ...groups,

    // Moderation - ~15 functions
    ...moderation,

    // Price Alerts - ~15 functions
    ...priceAlerts,

    // Topics - ~10 functions
    ...topics,

    // AI - ~20 functions
    ...ai,

    // Command Usage - ~15 functions
    ...commandUsage,

    // Games - ~20 functions
    ...games,

    // Scheduled Posts - ~6 functions
    ...scheduledPosts,

    // Preferences - AI memory
    ...preferences,

    // Trade History - P&L tracking
    ...tradeHistory,

    // Scheduled Reports
    ...scheduledReports,

    // Durable Reactive welcome verification
    ...welcomeAdmissions,

    // Tenant-scoped Telegram Chat AI history
    ...aiConversations,

    // Schema - init function
    ...schema,

    // Module references for advanced usage
    _modules: {
        core,
        checkin,
        users,
        wallets,
        groups,
        moderation,
        priceAlerts,
        topics,
        ai,
        commandUsage,
        games,
        scheduledPosts,
        preferences,
        tradeHistory,
        scheduledReports,
        welcomeAdmissions,
        schema
    }
};
