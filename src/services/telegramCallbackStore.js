'use strict';

const crypto = require('crypto');

class TelegramCallbackStore {
  constructor({ ttlMs = 10 * 60 * 1000, now = Date.now, randomBytes = crypto.randomBytes } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.randomBytes = randomBytes;
    this.entries = new Map();
  }

  issue({ action, userId, chatId, messageId, revision, payload, mutation = false, ttlMs } = {}) {
    const token = this.randomBytes(9).toString('base64url');
    const callbackData = `xa1:${token}`;
    this.entries.set(token, {
      action: String(action || ''),
      userId: String(userId || ''),
      chatId: String(chatId || ''),
      messageId: messageId == null ? '' : String(messageId),
      revision: String(revision || ''),
      payload,
      mutation: Boolean(mutation),
      consumed: false,
      createdAt: this.now(),
      expiresAt: this.now() + Math.max(1, Number(ttlMs || this.ttlMs))
    });
    return callbackData;
  }

  bindMessage(callbackData, messageId) {
    const entry = this._entry(callbackData);
    if (entry) entry.messageId = String(messageId || '');
  }

  consume(callbackData, { userId, chatId, messageId, revision } = {}) {
    const entry = this._entry(callbackData);
    if (!entry) return { ok: false, code: 'UNKNOWN' };
    if (this.now() > entry.expiresAt) {
      this.entries.delete(callbackData.slice(4));
      return { ok: false, code: 'EXPIRED' };
    }
    if (entry.userId && entry.userId !== String(userId || '')) return { ok: false, code: 'WRONG_USER' };
    if (entry.chatId && entry.chatId !== String(chatId || '')) return { ok: false, code: 'WRONG_CHAT' };
    if (entry.messageId && entry.messageId !== String(messageId || '')) return { ok: false, code: 'STALE_MESSAGE' };
    if (entry.revision && revision != null && entry.revision !== String(revision)) return { ok: false, code: 'STALE_REVISION' };
    if (entry.mutation && entry.consumed) return { ok: false, code: 'DUPLICATE' };
    if (entry.mutation) entry.consumed = true;
    return { ok: true, entry: { ...entry } };
  }

  _entry(callbackData) {
    const value = String(callbackData || '');
    return value.startsWith('xa1:') ? this.entries.get(value.slice(4)) : null;
  }

  cleanup() {
    const now = this.now();
    for (const [token, entry] of this.entries) if (now > entry.expiresAt) this.entries.delete(token);
  }
}

module.exports = { TelegramCallbackStore };
