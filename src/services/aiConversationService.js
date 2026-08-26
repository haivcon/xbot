'use strict';

const crypto = require('crypto');

function serviceError(code, message) {
  return Object.assign(new Error(message), { code });
}

class AiConversationService {
  constructor({ idFactory = () => crypto.randomUUID(), now = Date.now, adapter = null } = {}) {
    this.idFactory = idFactory;
    this.now = now;
    this.adapter = adapter;
    this.conversations = new Map();
    this.generations = new Map();
    this.idempotency = new Map();
  }

  _tenant(value) {
    const tenantId = String(value || '');
    if (!tenantId) throw serviceError('TENANT_REQUIRED', 'Tenant is required');
    return tenantId;
  }

  async newConversation({ tenantId, routeRef = '', idempotencyKey = '' } = {}) {
    const tenant = this._tenant(tenantId);
    const key = idempotencyKey ? `${tenant}:new:${idempotencyKey}` : '';
    if (key && this.idempotency.has(key)) return this.getConversation({ tenantId: tenant, conversationId: this.idempotency.get(key) });
    const conversation = { id: this.idFactory(), tenantId: tenant, routeRef: String(routeRef), status: 'ready', turns: [], createdAt: this.now(), updatedAt: this.now() };
    this.conversations.set(conversation.id, conversation);
    if (key) this.idempotency.set(key, conversation.id);
    await this.adapter?.saveConversation?.(conversation);
    return { ...conversation, turns: [...conversation.turns] };
  }

  async getConversation({ tenantId, conversationId } = {}) {
    const tenant = this._tenant(tenantId);
    const id = String(conversationId);
    let conversation = this.conversations.get(id);
    if (!conversation) {
      conversation = await this.adapter?.getConversation?.(tenant, id);
      if (conversation?.tenantId === tenant) this.conversations.set(id, conversation);
    }
    if (!conversation || conversation.tenantId !== tenant) return null;
    return { ...conversation, turns: [...(conversation.turns || [])] };
  }

  async listConversations({ tenantId, limit = 10 } = {}) {
    const tenant = this._tenant(tenantId);
    const boundedLimit = Math.max(1, Math.min(50, limit));
    const persisted = await this.adapter?.listConversations?.(tenant, boundedLimit) || [];
    const merged = new Map(persisted.map(item => [item.id, item]));
    for (const item of this.conversations.values()) if (item.tenantId === tenant) merged.set(item.id, item);
    return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, boundedLimit).map(item => ({ ...item, turns: undefined }));
  }

  async selectConversation({ tenantId, conversationId, routeRef } = {}) {
    const tenant = this._tenant(tenantId);
    const conversation = await this.getConversation({ tenantId: tenant, conversationId });
    if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', 'Conversation not found');
    conversation.routeRef = String(routeRef || '');
    conversation.updatedAt = this.now();
    this.conversations.set(conversation.id, conversation);
    await this.adapter?.saveConversation?.(conversation);
    return { ...conversation, turns: [...(conversation.turns || [])] };
  }

  async resumeConversation({ tenantId, conversationId } = {}) {
    const conversation = await this.getConversation({ tenantId, conversationId });
    if (!conversation) throw serviceError('CONVERSATION_NOT_FOUND', 'Conversation not found');
    return conversation;
  }

  async beginGeneration({ tenantId, conversationId, prompt, routeRef = '', idempotencyKey = '' } = {}) {
    const tenant = this._tenant(tenantId);
    const conversation = this.conversations.get(String(conversationId));
    if (!conversation || conversation.tenantId !== tenant) throw serviceError('CONVERSATION_NOT_FOUND', 'Conversation not found');
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) throw serviceError('PROMPT_REQUIRED', 'Prompt is required');
    const key = idempotencyKey ? `${tenant}:generation:${conversation.id}:${idempotencyKey}` : '';
    if (key && this.idempotency.has(key)) return { ...this.generations.get(this.idempotency.get(key)) };
    const generation = { id: this.idFactory(), tenantId: tenant, conversationId: conversation.id, prompt: normalizedPrompt, routeRef: String(routeRef || conversation.routeRef), status: 'running', partialText: '', retryable: true, createdAt: this.now(), updatedAt: this.now(), abortController: new AbortController() };
    this.generations.set(generation.id, generation);
    conversation.status = 'generating';
    conversation.updatedAt = this.now();
    if (key) this.idempotency.set(key, generation.id);
    return { ...generation };
  }

  async appendDelta({ tenantId, generationId, text } = {}) {
    const generation = this._generation(tenantId, generationId);
    if (generation.status !== 'running') return { ...generation };
    generation.partialText += String(text || '');
    generation.updatedAt = this.now();
    return { ...generation };
  }

  async stopGeneration({ tenantId, generationId } = {}) {
    const generation = this._generation(tenantId, generationId);
    if (generation.status === 'running') {
      generation.abortController.abort();
      generation.status = 'stopped';
      generation.retryable = true;
      generation.updatedAt = this.now();
      await this._finishConversation(generation, 'interrupted');
    }
    return { ...generation };
  }

  async interruptGeneration({ tenantId, generationId, code = 'INTERRUPTED' } = {}) {
    const generation = this._generation(tenantId, generationId);
    if (generation.status === 'running') generation.abortController.abort();
    generation.status = 'interrupted';
    generation.code = String(code);
    generation.retryable = true;
    generation.updatedAt = this.now();
    await this._finishConversation(generation, 'interrupted');
    return { ...generation };
  }

  async completeGeneration({ tenantId, generationId, text = '' } = {}) {
    const generation = this._generation(tenantId, generationId);
    if (generation.status !== 'running') return { ...generation };
    generation.partialText = String(text || generation.partialText);
    generation.status = 'completed';
    generation.retryable = false;
    generation.updatedAt = this.now();
    await this._finishConversation(generation, 'completed');
    return { ...generation };
  }

  async retryLatest({ tenantId, conversationId } = {}) {
    const tenant = this._tenant(tenantId);
    const latest = [...this.generations.values()].filter(item => item.tenantId === tenant && item.conversationId === String(conversationId)).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!latest || !latest.retryable || !['stopped', 'interrupted'].includes(latest.status)) throw serviceError('NOT_RETRYABLE', 'The latest turn is not retryable');
    latest.retryable = false;
    return { prompt: latest.prompt, routeRef: latest.routeRef, sourceGenerationId: latest.id, status: 'claimed' };
  }

  getActiveGeneration({ tenantId, conversationId } = {}) {
    const tenant = this._tenant(tenantId);
    const item = [...this.generations.values()].find(entry => entry.tenantId === tenant && entry.conversationId === String(conversationId) && entry.status === 'running');
    return item ? { ...item } : null;
  }

  getLatestGeneration({ tenantId, conversationId } = {}) {
    const tenant = this._tenant(tenantId);
    const item = [...this.generations.values()]
      .filter(entry => entry.tenantId === tenant && entry.conversationId === String(conversationId))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return item ? { ...item } : null;
  }

  _generation(tenantId, generationId) {
    const tenant = this._tenant(tenantId);
    const generation = this.generations.get(String(generationId));
    if (!generation || generation.tenantId !== tenant) throw serviceError('GENERATION_NOT_FOUND', 'Generation not found');
    return generation;
  }

  async _finishConversation(generation, assistantStatus) {
    const conversation = this.conversations.get(generation.conversationId);
    if (!conversation || conversation.tenantId !== generation.tenantId) return;
    conversation.status = 'ready';
    conversation.updatedAt = this.now();
    conversation.turns = conversation.turns.filter(turn => turn.generationId !== generation.id);
    conversation.turns.push({ role: 'user', content: generation.prompt, generationId: generation.id });
    if (generation.partialText) conversation.turns.push({ role: 'assistant', content: generation.partialText, status: assistantStatus, generationId: generation.id });
    await this.adapter?.saveConversation?.(conversation);
  }
}

module.exports = { AiConversationService, serviceError };
