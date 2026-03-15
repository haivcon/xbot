/**
 * Channel Adapter — Idea #3 Multi-Channel
 * Abstract base class for channel adapters (Telegram, Discord, Web)
 */
const logger = require('../core/logger');
const log = logger.child('Channel');

/**
 * Base Channel Adapter
 * All channel adapters must implement these methods
 */
class ChannelAdapter {
    constructor(name) {
        this.name = name;
        this.connected = false;
    }

    /**
     * Connect the channel
     */
    async connect() {
        throw new Error('connect() must be implemented');
    }

    /**
     * Disconnect the channel
     */
    async disconnect() {
        this.connected = false;
    }

    /**
     * Send a message to a channel/user
     * @param {string} channelId - Channel/chat ID
     * @param {string} text - Message text (HTML format)
     * @param {object} options - { buttons, media, replyTo }
     */
    async sendMessage(channelId, text, options = {}) {
        throw new Error('sendMessage() must be implemented');
    }

    /**
     * Register a message handler
     * @param {function} handler - (standardMessage) => void
     */
    onMessage(handler) {
        this._messageHandler = handler;
    }

    /**
     * Convert incoming message to standard format
     * @returns {{ text, sender: { id, name, avatar }, channel: { id, name, type }, media, replyTo, raw }}
     */
    _toStandardMessage(raw) {
        throw new Error('_toStandardMessage() must be implemented');
    }

    /**
     * Handle incoming message and route to handler
     */
    _handleIncoming(raw) {
        try {
            const standardMsg = this._toStandardMessage(raw);
            if (this._messageHandler) {
                this._messageHandler(standardMsg);
            }
        } catch (err) {
            log.error(`[${this.name}] Message handling error:`, err.message);
        }
    }
}

/**
 * Telegram Channel Adapter (wraps existing bot)
 */
class TelegramChannel extends ChannelAdapter {
    constructor(bot) {
        super('telegram');
        this.bot = bot;
    }

    async connect() {
        this.connected = true;
        // The bot is already connected via polling/webhook
        log.info('Telegram channel connected (using existing bot instance)');
    }

    async sendMessage(channelId, text, options = {}) {
        const opts = { parse_mode: 'HTML', disable_web_page_preview: true };
        if (options.buttons) {
            opts.reply_markup = { inline_keyboard: options.buttons };
        }
        if (options.replyTo) {
            opts.reply_to_message_id = options.replyTo;
        }
        return await this.bot.sendMessage(channelId, text, opts);
    }

    _toStandardMessage(msg) {
        return {
            text: msg.text || '',
            sender: {
                id: String(msg.from?.id || ''),
                name: msg.from?.first_name || 'Unknown',
                avatar: null
            },
            channel: {
                id: String(msg.chat?.id || ''),
                name: msg.chat?.title || 'DM',
                type: msg.chat?.type || 'private'
            },
            media: msg.photo || msg.document || msg.voice ? { type: 'attachment', raw: msg } : null,
            replyTo: msg.reply_to_message?.message_id || null,
            raw: msg
        };
    }
}

/**
 * Discord Channel Adapter (placeholder — requires discord.js dependency)
 */
class DiscordChannel extends ChannelAdapter {
    constructor(token) {
        super('discord');
        this.token = token;
        this.client = null;
    }

    async connect() {
        // W12 fix: Gracefully handle missing discord.js
        let Client, GatewayIntentBits;
        try {
            ({ Client, GatewayIntentBits } = require('discord.js'));
        } catch (e) {
            log.warn('Discord channel disabled: discord.js not installed. Run: npm install discord.js');
            return; // Don't crash — just skip
        }

        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.DirectMessages
                ]
            });

            this.client.on('messageCreate', (msg) => {
                if (msg.author.bot) return;
                this._handleIncoming(msg);
            });

            await this.client.login(this.token);
            this.connected = true;
            log.info('Discord channel connected');
        } catch (err) {
            log.error('Discord connection failed:', err.message);
        }
    }

    async disconnect() {
        if (this.client) await this.client.destroy();
        this.connected = false;
    }

    async sendMessage(channelId, text, options = {}) {
        if (!this.client) throw new Error('Discord not connected');
        const channel = await this.client.channels.fetch(channelId);
        if (!channel) throw new Error(`Channel ${channelId} not found`);

        // Convert HTML to Discord markdown
        const discordText = text
            .replace(/<b>/g, '**').replace(/<\/b>/g, '**')
            .replace(/<i>/g, '*').replace(/<\/i>/g, '*')
            .replace(/<code>/g, '`').replace(/<\/code>/g, '`')
            .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '[$2]($1)')
            .replace(/<[^>]+>/g, '');

        return await channel.send(discordText);
    }

    _toStandardMessage(msg) {
        return {
            text: msg.content || '',
            sender: {
                id: msg.author.id,
                name: msg.author.username || 'Unknown',
                avatar: msg.author.displayAvatarURL() || null
            },
            channel: {
                id: msg.channel.id,
                name: msg.channel.name || 'DM',
                type: msg.channel.isDMBased() ? 'private' : 'group'
            },
            media: msg.attachments.size > 0 ? { type: 'attachment', raw: msg.attachments } : null,
            replyTo: msg.reference?.messageId || null,
            raw: msg
        };
    }
}

/**
 * Web Chat Channel (WebSocket-based)
 */
class WebChannel extends ChannelAdapter {
    constructor(wss, options = {}) {
        super('web');
        this.wss = wss; // WebSocket server instance
        this.connections = new Map(); // channelId -> ws
        // W13 fix: Auth token for WebSocket connections
        this.authToken = options.authToken || process.env.WEB_CHANNEL_AUTH_TOKEN || null;
    }

    async connect() {
        if (!this.wss) {
            log.warn('No WebSocket server provided for web channel');
            return;
        }

        this.wss.on('connection', (ws, req) => {
            // W13 fix: Validate auth token if configured
            if (this.authToken) {
                const url = new URL(req.url, 'ws://localhost');
                const token = url.searchParams.get('token');
                if (token !== this.authToken) {
                    log.warn('WebSocket auth failed: invalid token');
                    ws.close(4001, 'Unauthorized');
                    return;
                }
            }

            const channelId = new URL(req.url, 'ws://localhost').searchParams.get('id') || `web_${Date.now()}`;
            this.connections.set(channelId, ws);
            log.info(`Web client connected: ${channelId}`);

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    this._handleIncoming({ ...msg, channelId });
                } catch (e) { /* ignore invalid JSON */ }
            });

            ws.on('close', () => {
                this.connections.delete(channelId);
            });
        });

        this.connected = true;
        log.info('Web channel connected');
    }

    async sendMessage(channelId, text, options = {}) {
        const ws = this.connections.get(channelId);
        if (!ws || ws.readyState !== 1) {
            log.warn(`Web client ${channelId} not connected`);
            return;
        }

        ws.send(JSON.stringify({
            type: 'message',
            text,
            buttons: options.buttons || null,
            timestamp: Date.now()
        }));
    }

    _toStandardMessage(raw) {
        return {
            text: raw.text || '',
            sender: {
                id: raw.userId || raw.channelId,
                name: raw.userName || 'Web User',
                avatar: null
            },
            channel: {
                id: raw.channelId,
                name: 'Web Chat',
                type: 'web'
            },
            media: null,
            replyTo: null,
            raw
        };
    }
}

/**
 * Channel Manager — routes messages across channels
 */
class ChannelManager {
    constructor() {
        this.channels = new Map();
    }

    register(name, adapter) {
        this.channels.set(name, adapter);
        log.info(`Registered channel: ${name}`);
    }

    get(name) {
        return this.channels.get(name);
    }

    async connectAll() {
        for (const [name, adapter] of this.channels) {
            try {
                await adapter.connect();
                log.info(`Connected channel: ${name}`);
            } catch (err) {
                log.error(`Failed to connect ${name}:`, err.message);
            }
        }
    }

    /**
     * Broadcast a message to all connected channels
     */
    async broadcast(text, options = {}) {
        const results = [];
        for (const [name, adapter] of this.channels) {
            if (adapter.connected && options.channelIds?.[name]) {
                try {
                    await adapter.sendMessage(options.channelIds[name], text, options);
                    results.push({ channel: name, success: true });
                } catch (err) {
                    results.push({ channel: name, success: false, error: err.message });
                }
            }
        }
        return results;
    }
}

// ═══════════════════════════════════════════════════════
// Slack Channel (via @slack/bolt)
// Inspired by OpenClaw: src/slack/
// ═══════════════════════════════════════════════════════

class SlackChannel extends ChannelAdapter {
    constructor(options = {}) {
        super('slack');
        this.token = options.token || process.env.SLACK_BOT_TOKEN;
        this.signingSecret = options.signingSecret || process.env.SLACK_SIGNING_SECRET;
        this.appToken = options.appToken || process.env.SLACK_APP_TOKEN;
        this.app = null;
    }

    async connect() {
        let App;
        try {
            ({ App } = require('@slack/bolt'));
        } catch (e) {
            log.warn('Slack channel disabled: @slack/bolt not installed. Run: npm install @slack/bolt');
            return;
        }

        if (!this.token || !this.signingSecret) {
            log.warn('Slack channel disabled: SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not configured.');
            return;
        }

        try {
            this.app = new App({
                token: this.token,
                signingSecret: this.signingSecret,
                appToken: this.appToken,
                socketMode: !!this.appToken // Use socket mode if app token is available
            });

            this.app.message(async ({ message, say }) => {
                if (message.subtype) return; // Ignore bot messages, edits, etc.
                this._handleIncoming({ ...message, _say: say });
            });

            await this.app.start();
            this.connected = true;
            log.info('Slack channel connected');
        } catch (err) {
            log.error('Slack connection failed:', err.message);
        }
    }

    async disconnect() {
        if (this.app) await this.app.stop();
        this.connected = false;
    }

    async sendMessage(channelId, text, options = {}) {
        if (!this.app) throw new Error('Slack not connected');
        const { WebClient } = require('@slack/web-api');
        const client = new WebClient(this.token);

        // Convert HTML to Slack mrkdwn
        const slackText = text
            .replace(/<b>/g, '*').replace(/<\/b>/g, '*')
            .replace(/<i>/g, '_').replace(/<\/i>/g, '_')
            .replace(/<code>/g, '`').replace(/<\/code>/g, '`')
            .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '<$1|$2>')
            .replace(/<[^>]+>/g, '');

        return await client.chat.postMessage({
            channel: channelId,
            text: slackText,
            mrkdwn: true
        });
    }

    _toStandardMessage(msg) {
        return {
            text: msg.text || '',
            sender: { id: msg.user || '', name: msg.user || 'Unknown', avatar: null },
            channel: { id: msg.channel || '', name: msg.channel || 'DM', type: msg.channel_type === 'im' ? 'private' : 'group' },
            media: msg.files && msg.files.length > 0 ? { type: 'attachment', raw: msg.files } : null,
            replyTo: msg.thread_ts || null,
            raw: msg
        };
    }
}

// ═══════════════════════════════════════════════════════
// WhatsApp Channel (via whatsapp-web.js or Baileys)
// Inspired by OpenClaw: src/whatsapp/
// ═══════════════════════════════════════════════════════

class WhatsAppChannel extends ChannelAdapter {
    constructor(options = {}) {
        super('whatsapp');
        this.authStrategy = options.authStrategy || 'local'; // 'local' or 'multidevice'
        this.client = null;
    }

    async connect() {
        let Client, LocalAuth;
        try {
            ({ Client, LocalAuth } = require('whatsapp-web.js'));
        } catch (e) {
            log.warn('WhatsApp channel disabled: whatsapp-web.js not installed. Run: npm install whatsapp-web.js');
            return;
        }

        try {
            this.client = new Client({
                authStrategy: new LocalAuth(),
                puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
            });

            this.client.on('qr', (qr) => {
                log.info('WhatsApp QR Code received. Scan with your phone app.');
                // In production, send QR to admin via Telegram
                try {
                    const qrcode = require('qrcode-terminal');
                    qrcode.generate(qr, { small: true });
                } catch (e) {
                    log.info('QR string:', qr);
                }
            });

            this.client.on('ready', () => {
                this.connected = true;
                log.info('WhatsApp channel connected and ready');
            });

            this.client.on('message', (msg) => {
                if (msg.fromMe) return;
                this._handleIncoming(msg);
            });

            await this.client.initialize();
        } catch (err) {
            log.error('WhatsApp connection failed:', err.message);
        }
    }

    async disconnect() {
        if (this.client) await this.client.destroy();
        this.connected = false;
    }

    async sendMessage(channelId, text, options = {}) {
        if (!this.client) throw new Error('WhatsApp not connected');
        // Convert HTML to plain text (WhatsApp uses *bold* _italic_ ~strike~ ```mono```)
        const waText = text
            .replace(/<b>/g, '*').replace(/<\/b>/g, '*')
            .replace(/<i>/g, '_').replace(/<\/i>/g, '_')
            .replace(/<code>/g, '```').replace(/<\/code>/g, '```')
            .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2 ($1)')
            .replace(/<[^>]+>/g, '');

        return await this.client.sendMessage(channelId, waText);
    }

    _toStandardMessage(msg) {
        const contact = msg.getContact ? null : null; // Lazy load
        return {
            text: msg.body || '',
            sender: { id: msg.from || '', name: msg._data?.notifyName || 'Unknown', avatar: null },
            channel: { id: msg.from || '', name: msg._data?.notifyName || 'DM', type: msg.from?.endsWith('@g.us') ? 'group' : 'private' },
            media: msg.hasMedia ? { type: 'attachment', raw: msg } : null,
            replyTo: msg.hasQuotedMsg ? msg._data?.quotedStanzaID : null,
            raw: msg
        };
    }
}

// ═══════════════════════════════════════════════════════
// Signal Channel (via signal-cli REST API)
// Inspired by OpenClaw: src/signal/
// ═══════════════════════════════════════════════════════

class SignalChannel extends ChannelAdapter {
    constructor(options = {}) {
        super('signal');
        this.apiUrl = options.apiUrl || process.env.SIGNAL_API_URL || 'http://localhost:8080';
        this.phoneNumber = options.phoneNumber || process.env.SIGNAL_PHONE_NUMBER;
        this.pollInterval = null;
    }

    async connect() {
        if (!this.phoneNumber) {
            log.warn('Signal channel disabled: SIGNAL_PHONE_NUMBER not configured.');
            return;
        }

        const axios = require('axios');
        try {
            // Test connection to signal-cli REST API
            await axios.get(`${this.apiUrl}/v1/about`, { timeout: 5000 });
            this.connected = true;
            log.info('Signal channel connected via REST API');

            // Start polling for new messages
            this.pollInterval = setInterval(async () => {
                try {
                    const res = await axios.get(`${this.apiUrl}/v1/receive/${this.phoneNumber}`, { timeout: 10000 });
                    const messages = res.data || [];
                    for (const msg of messages) {
                        if (msg.envelope?.dataMessage) {
                            this._handleIncoming(msg);
                        }
                    }
                } catch (e) { /* silence poll errors */ }
            }, 3000);
        } catch (err) {
            log.warn('Signal channel disabled: signal-cli REST API not reachable at', this.apiUrl);
        }
    }

    async disconnect() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.connected = false;
    }

    async sendMessage(channelId, text, options = {}) {
        const axios = require('axios');
        // Convert HTML to plain text
        const plainText = text.replace(/<[^>]+>/g, '');

        return await axios.post(`${this.apiUrl}/v2/send`, {
            message: plainText,
            number: this.phoneNumber,
            recipients: [channelId]
        }, { timeout: 10000 });
    }

    _toStandardMessage(raw) {
        const env = raw.envelope || {};
        const data = env.dataMessage || {};
        return {
            text: data.message || '',
            sender: { id: env.source || '', name: env.sourceName || 'Unknown', avatar: null },
            channel: { id: data.groupInfo?.groupId || env.source || '', name: data.groupInfo?.groupName || 'DM', type: data.groupInfo ? 'group' : 'private' },
            media: data.attachments?.length > 0 ? { type: 'attachment', raw: data.attachments } : null,
            replyTo: data.quote?.id || null,
            raw
        };
    }
}

// ═══════════════════════════════════════════════════════
// LINE Channel (via @line/bot-sdk)
// ═══════════════════════════════════════════════════════

class LINEChannel extends ChannelAdapter {
    constructor(options = {}) {
        super('line');
        this.channelAccessToken = options.channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
        this.channelSecret = options.channelSecret || process.env.LINE_CHANNEL_SECRET;
        this.client = null;
        this.server = null;
    }

    async connect() {
        let line;
        try {
            line = require('@line/bot-sdk');
        } catch (e) {
            log.warn('LINE channel disabled: @line/bot-sdk not installed. Run: npm install @line/bot-sdk');
            return;
        }

        if (!this.channelAccessToken || !this.channelSecret) {
            log.warn('LINE channel disabled: LINE_CHANNEL_ACCESS_TOKEN or LINE_CHANNEL_SECRET not configured.');
            return;
        }

        try {
            const config = { channelAccessToken: this.channelAccessToken, channelSecret: this.channelSecret };
            this.client = new line.Client(config);

            // Create webhook server
            const express = require('express');
            const app = express();
            const port = process.env.LINE_WEBHOOK_PORT || 3100;

            app.post('/line/webhook', line.middleware(config), (req, res) => {
                const events = req.body.events || [];
                for (const event of events) {
                    if (event.type === 'message' && event.message.type === 'text') {
                        this._handleIncoming(event);
                    }
                }
                res.status(200).end();
            });

            this.server = app.listen(port, () => {
                this.connected = true;
                log.info(`LINE channel connected (webhook on port ${port})`);
            });
        } catch (err) {
            log.error('LINE connection failed:', err.message);
        }
    }

    async disconnect() {
        if (this.server) this.server.close();
        this.connected = false;
    }

    async sendMessage(channelId, text, options = {}) {
        if (!this.client) throw new Error('LINE not connected');
        // Convert HTML to LINE plain text (LINE supports limited formatting)
        const lineText = text
            .replace(/<b>/g, '').replace(/<\/b>/g, '')
            .replace(/<i>/g, '').replace(/<\/i>/g, '')
            .replace(/<code>/g, '').replace(/<\/code>/g, '')
            .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2: $1')
            .replace(/<[^>]+>/g, '');

        return await this.client.pushMessage(channelId, { type: 'text', text: lineText });
    }

    _toStandardMessage(event) {
        return {
            text: event.message?.text || '',
            sender: { id: event.source?.userId || '', name: 'LINE User', avatar: null },
            channel: { id: event.source?.groupId || event.source?.roomId || event.source?.userId || '', name: event.source?.groupId ? 'Group' : 'DM', type: event.source?.type === 'group' ? 'group' : 'private' },
            media: null,
            replyTo: null,
            raw: event
        };
    }
}

// ═══════════════════════════════════════════════════════
// MS Teams Channel (via botbuilder)
// Inspired by OpenClaw: src/config/types.msteams.ts
// ═══════════════════════════════════════════════════════

class MSTeamsChannel extends ChannelAdapter {
    constructor(options = {}) {
        super('msteams');
        this.appId = options.appId || process.env.TEAMS_APP_ID;
        this.appPassword = options.appPassword || process.env.TEAMS_APP_PASSWORD;
        this.adapter = null;
    }

    async connect() {
        let BotFrameworkAdapter;
        try {
            ({ BotFrameworkAdapter } = require('botbuilder'));
        } catch (e) {
            log.warn('MS Teams channel disabled: botbuilder not installed. Run: npm install botbuilder');
            return;
        }

        if (!this.appId || !this.appPassword) {
            log.warn('MS Teams channel disabled: TEAMS_APP_ID or TEAMS_APP_PASSWORD not configured.');
            return;
        }

        try {
            this.adapter = new BotFrameworkAdapter({
                appId: this.appId,
                appPassword: this.appPassword
            });

            this.adapter.onTurnError = async (context, error) => {
                log.error('MS Teams error:', error.message);
            };

            // Create webhook server
            const express = require('express');
            const app = express();
            const port = process.env.TEAMS_WEBHOOK_PORT || 3978;

            app.use(express.json());
            app.post('/api/messages', (req, res) => {
                this.adapter.processActivity(req, res, async (context) => {
                    if (context.activity.type === 'message') {
                        this._handleIncoming(context);
                    }
                });
            });

            app.listen(port, () => {
                this.connected = true;
                log.info(`MS Teams channel connected (webhook on port ${port})`);
            });
        } catch (err) {
            log.error('MS Teams connection failed:', err.message);
        }
    }

    async sendMessage(channelId, text, options = {}) {
        // For proactive messaging, you need stored conversation references
        log.warn('MS Teams proactive messaging requires conversation references. Use reply in context instead.');
    }

    _toStandardMessage(context) {
        const activity = context.activity || {};
        return {
            text: activity.text || '',
            sender: { id: activity.from?.id || '', name: activity.from?.name || 'Unknown', avatar: null },
            channel: { id: activity.conversation?.id || '', name: activity.conversation?.name || 'Teams Chat', type: activity.conversation?.isGroup ? 'group' : 'private' },
            media: activity.attachments?.length > 0 ? { type: 'attachment', raw: activity.attachments } : null,
            replyTo: activity.replyToId || null,
            raw: context
        };
    }
}

module.exports = {
    ChannelAdapter, TelegramChannel, DiscordChannel, WebChannel,
    SlackChannel, WhatsAppChannel, SignalChannel, LINEChannel, MSTeamsChannel,
    ChannelManager
};

