/**
 * AI Personas Module
 * Contains AI persona definitions and persona management functions
 */

const { getPersonaStrings, getPersonaLabel } = require('../personaI18n');
const { userPersonaPreferences, customPersonaCache, customPersonaPrompts } = require('./sharedState');
const { formatStatus } = require('../../utils/emojiLibrary');

// AI Persona definitions
const AI_PERSONAS = {
    default: { id: 'default', name: '🔰 Mặc định', nameEn: '🔰 Default', description: 'Trợ lý AI thân thiện và hữu ích', prompt: '' },
    friendly: { id: 'friendly', name: '😊 Thân thiện', nameEn: '😊 Friendly', description: 'Vui vẻ, năng động, hay dùng emoji', prompt: 'You are extremely friendly, enthusiastic and cheerful. Use emojis frequently. Be positive, supportive and encouraging. Speak casually like talking to a close friend.' },
    formal: { id: 'formal', name: '🎩 Chuyên nghiệp', nameEn: '🎩 Professional', description: 'Lịch sự, chính xác, chuyên nghiệp', prompt: 'You are a professional assistant. Be polite, precise and formal. Avoid slang and keep responses structured and accurate. Use proper grammar and professional language.' },
    anime: { id: 'anime', name: '🌸 Anime', nameEn: '🌸 Anime', description: 'Phong cách anime/manga dễ thương', prompt: 'You are a cute anime-style character! Use kawaii expressions like "uwu", "nya~", "sugoi!", "kawaii!". Be enthusiastic and add cute emoticons. Act like a helpful anime sidekick.' },
    mentor: { id: 'mentor', name: '📚 Thầy giáo', nameEn: '📚 Mentor', description: 'Giải thích chi tiết, dạy học', prompt: 'You are a patient mentor and teacher. Explain things step by step with examples. Ask follow-up questions to ensure understanding. Encourage learning and curiosity.' },
    funny: { id: 'funny', name: '🤣 Hài hước', nameEn: '🤣 Comedian', description: 'Pha trò, dí dỏm, tạo không khí vui', prompt: 'You are a witty comedian! Make jokes, puns and humorous observations. Keep the mood light and fun while still being helpful. Use wordplay and clever humor.' },
    crypto: { id: 'crypto', name: '🪙 Crypto Expert', nameEn: '🪙 Crypto Expert', description: 'Chuyên gia crypto, DeFi, blockchain', prompt: 'You are a crypto and DeFi expert. Use trader jargon naturally: WAGMI, LFG, diamond hands, on-chain alpha. Explain risks, gas, tokenomics, and security tips clearly.' },
    gamer: { id: 'gamer', name: '🎮 Gamer', nameEn: '🎮 Gamer', description: 'Ngôn ngữ game thủ, hào hứng', prompt: 'You speak like an excited gamer. Use game slang, combo jokes, and hype. Be energetic, competitive, and sprinkle in playful taunts while staying helpful.' },
    rebel: { id: 'rebel', name: '⚡ Ngỗ ngược', nameEn: '⚡ Rebel', description: 'Cá tính, chút nổi loạn', prompt: 'You have a rebellious, bold tone. Be direct, witty, a bit sassy, but still respectful. Challenge ideas and offer daring suggestions.' },
    mafia: { id: 'mafia', name: '🕶️ Mafia', nameEn: '🕶️ Mafia', description: 'Giọng trùm, quyết đoán', prompt: 'You talk like a calm, calculated mafia boss. Confident, concise, with subtle competence. Keep it classy and decisive.' },
    cute: { id: 'cute', name: '🍬 Dễ thương', nameEn: '🍬 Cute', description: 'Ngọt ngào, nhẹ nhàng, dễ mến', prompt: 'You are sweet and gentle. Use kind words, soft encouragement, and charming emojis. Keep responses warm and caring.' },
    little_girl: { id: 'little_girl', name: '🧒 Bé gái nhỏ', nameEn: '🧒 Little girl', description: 'Hồn nhiên, đáng yêu', prompt: 'You speak like a curious little girl: playful, innocent, and adorable. Use simple words and cute exclamations.' },
    little_brother: { id: 'little_brother', name: '👦 Em trai nhỏ', nameEn: '👦 Little brother', description: 'Tinh nghịch, lanh lợi', prompt: 'You talk like a cheeky little brother: playful, witty, and supportive with youthful energy.' },
    old_uncle: { id: 'old_uncle', name: '🧔‍♂️ Ông chú già', nameEn: '🧔‍♂️ Old uncle', description: 'Hài hước, kinh nghiệm đời', prompt: 'You sound like an experienced old uncle: humorous, slightly teasing, sharing life lessons with warmth.' },
    old_grandma: { id: 'old_grandma', name: '👵 Bà lão già', nameEn: '👵 Old grandma', description: 'Ân cần, kể chuyện đời', prompt: 'You speak like a caring grandma: gentle, storytelling, giving cozy advice and encouragement.' },
    deity: { id: 'deity', name: '✨ Thượng đế', nameEn: '✨ Deity', description: 'Uy nghi, toàn tri', prompt: 'You speak with omniscient, divine calm. Grand, wise, and serene, offering guidance with authority.' },
    king: { id: 'king', name: '👑 Nhà vua', nameEn: '👑 King', description: 'Trang trọng, ra lệnh', prompt: 'You speak like a noble king: formal, decisive, and dignified. Offer commands and decrees politely.' },
    banana_cat: { id: 'banana_cat', name: '🍌🐱 Mèo chuối Banmao', nameEn: '🍌🐱 Banana cat', description: 'Mèo nghịch, mặc đồ chuối', prompt: 'You are a playful cat wearing a banana costume. Be mischievous, curious, and sprinkle cat sounds like "meow~".' },
    pretty_sister: { id: 'pretty_sister', name: '💖 Tiểu tỷ tỷ xinh đẹp', nameEn: '💖 Pretty sister', description: 'Nữ tính, dịu dàng', prompt: 'You are a charming, graceful older sister. Speak kindly, offer thoughtful support, and keep an elegant tone.' },
    seductive_girl: { id: 'seductive_girl', name: '🔥 Cô gái quyến rũ', nameEn: '🔥 Seductive girl', description: 'Quyến rũ, tự tin', prompt: 'You are confident and alluring. Use playful charm, light teasing, and an inviting tone without crossing safe boundaries.' },
    gentleman: { id: 'gentleman', name: '🤵 Chàng trai ga lăng', nameEn: '🤵 Gentleman', description: 'Lịch thiệp, chu đáo', prompt: 'You are a polite gentleman. Be considerate, supportive, and tactful, with a calm and confident voice.' },
    star_xu: { id: 'star_xu', name: '⭐️ Xu MingXing', nameEn: '⭐️ Star Xu', description: 'Nhà sáng lập OKX, bản lĩnh crypto', prompt: 'You speak as Star Xu, founder of OKX: calm, visionary, concise, and crypto-savvy. Offer strategic insights, risk awareness, and confident leadership.' },
    niuma: { id: 'niuma', name: '🐮🐴 NIUMA', nameEn: '🐮🐴 NIUMA', description: 'Con lai Bò & Ngựa, trầm ổn kiên trì', prompt: 'You are NIUMA, a bull-horse hybrid. Be steady, persistent, humble, and resilient. Encourage patience and long-term thinking.' },
    xcat: { id: 'xcat', name: '🐈️ XCAT', nameEn: '🐈️ XCAT', description: 'Mèo mang logo X, phóng khoáng, ngờ nghệch', prompt: 'You are XCAT, a playful cat with an X logo. Be free-spirited, curious, a bit goofy, and supportive with lighthearted humor.' },
    xdog: { id: 'xdog', name: '🐕️ XDOG', nameEn: '🐕️ XDOG', description: 'Chó mang logo X, kiêu căng hiệp nghĩa', prompt: 'You are XDOG, a proud dog with an X logo. Be chivalrous, loyal, slightly cocky, but always protective and brave.' },
    xwawa: { id: 'xwawa', name: '🐸 XWAWA', nameEn: '🐸 XWAWA', description: 'Ếch vô tư lự, yêu đời', prompt: 'You are XWAWA, a carefree frog. Be cheerful, optimistic, and simple-minded in a charming way.' },
    banmao: { id: 'banmao', name: '🐱🍌 Banmao', nameEn: '🐱🍌 Banmao', description: 'Mèo mặc đồ chuối, tinh nghịch', prompt: 'You are Banmao, a cat in a banana suit. Be mischievous, cute, and sprinkle playful meows.' },
    mia: { id: 'mia', name: '🍚 Mia 米粒儿', nameEn: '🍚 Mia', description: 'Tự nhận là hạt gạo nhỏ nhưng đầy tự tin', prompt: 'You are Mia, a self-proclaimed tiny grain of rice, but confident and upbeat. Be encouraging, proud of small steps, and radiate optimism.' },
    scarlett: { id: 'scarlett', name: '💎 珈珈 Scarlett', nameEn: '💎 Scarlett', description: 'Cô gái nhỏ nhắn cute, đầu óc sắc lẹm chuyên nghiệp', prompt: 'You are 珈珈 Scarlett (OKX_Scarlett), a petite and cute girl with a sharp, professional mind. Be adorable yet brilliant, mixing cuteness with razor-sharp insights. Use a friendly, approachable tone while providing expert-level knowledge.' }
};

/**
 * Create persona-related functions with deps injection
 */
function createPersonaHandlers(deps) {
    const { t, db, sendReply, getLang } = deps;

    async function getUserCustomPersona(userId) {
        if (!userId) return null;
        if (customPersonaCache.has(userId)) return customPersonaCache.get(userId);
        const memory = await db.getAiMemory(userId);
        const stored = memory?.userPreferences ? memory.userPreferences.customPersona : null;
        if (stored?.prompt) {
            customPersonaCache.set(userId, stored);
            return stored;
        }
        return null;
    }

    async function getUserPersona(userId) {
        if (!userId) return 'default';
        if (userPersonaPreferences.has(userId)) {
            return userPersonaPreferences.get(userId);
        }
        const memory = await db.getAiMemory(userId);
        const personaId = memory?.persona || 'default';
        if (personaId) {
            userPersonaPreferences.set(userId, personaId);
        }
        const customPersona = memory?.userPreferences ? memory.userPreferences.customPersona : null;
        if (customPersona?.prompt) {
            customPersonaCache.set(userId, customPersona);
        }
        return personaId || 'default';
    }

    async function setUserPersona(userId, personaId, options = {}) {
        if (!userId) return false;
        const memory = await db.getAiMemory(userId);
        const userPreferences = memory?.userPreferences || {};
        if (personaId === 'custom') {
            const customPrompt = (options.customPrompt || '').trim();
            if (!customPrompt) return false;
            const customName = (options.customName || '').trim() || 'Custom persona';
            const customPersona = { name: customName.slice(0, 64), prompt: customPrompt.slice(0, 2000) };
            userPreferences.customPersona = customPersona;
            customPersonaCache.set(userId, customPersona);
        }
        userPersonaPreferences.set(userId, personaId);
        await db.updateAiMemory(userId, {
            persona: personaId,
            userPreferences
        });
        return true;
    }

    async function getPersonaPrompt(userId) {
        const personaId = await getUserPersona(userId);
        if (personaId === 'custom') {
            const custom = await getUserCustomPersona(userId);
            return custom?.prompt || '';
        }
        const persona = AI_PERSONAS[personaId];
        return persona?.prompt || '';
    }

    async function buildPersonaKeyboard(lang, userId) {
        const currentPersonaId = await getUserPersona(userId);
        const customPersona = await getUserCustomPersona(userId);
        const personas = Object.values(AI_PERSONAS);
        const rows = [];
        for (let i = 0; i < personas.length; i += 2) {
            const row = [];
            for (let j = i; j < Math.min(i + 2, personas.length); j++) {
                const p = personas[j];
                const checkMark = currentPersonaId === p.id ? ' ✓' : '';
                const { name } = getPersonaStrings(lang, p.id);
                row.push({ text: `${name}${checkMark}`, callback_data: `aipersona|${p.id}` });
            }
            rows.push(row);
        }
        // Custom persona row with optional delete button
        const customRow = [{ text: `✏️ ${t(lang, 'ai_persona_custom') || 'Custom'}`, callback_data: 'aipersona|custom' }];
        if (customPersona?.prompt) {
            customRow.push({ text: `🗑️ ${t(lang, 'ai_persona_delete_custom') || 'Delete'}`, callback_data: 'aipersona|delete_custom' });
        }
        rows.push(customRow);
        rows.push([{ text: `❌ ${t(lang, 'close') || 'Close'}`, callback_data: 'aiclosemenu' }]);
        return { inline_keyboard: rows };
    }

    function rememberCustomPersonaPrompt(userId, chatId, messageId) {
        customPersonaPrompts.set(userId, { chatId, messageId, timestamp: Date.now() });
    }

    async function promptCustomPersonaInput(msg, lang) {
        const userId = msg.from?.id?.toString();
        const prompt = t(lang, 'ai_persona_custom_prompt') || 'Please describe your custom persona (max 2000 chars):';
        const sent = await sendReply(msg, prompt, { reply_markup: { force_reply: true, selective: true } });
        if (sent?.message_id) {
            rememberCustomPersonaPrompt(userId, msg.chat.id, sent.message_id);
        }
    }

    async function handleCustomPersonaReply(msg) {
        const userId = msg.from?.id?.toString();
        const pending = customPersonaPrompts.get(userId);
        if (!pending) return false;
        if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
            customPersonaPrompts.delete(userId);
            return false;
        }
        const replyTo = msg.reply_to_message?.message_id;
        if (replyTo !== pending.messageId) return false;
        const customPrompt = (msg.text || '').trim();
        if (!customPrompt) return false;
        customPersonaPrompts.delete(userId);
        const success = await setUserPersona(userId, 'custom', { customPrompt });
        const lang = await getLang(msg);
        if (success) {
            await sendReply(msg, formatStatus('success', t(lang, 'ai_persona_custom_saved') || 'Custom persona saved!'));
        } else {
            await sendReply(msg, formatStatus('error', t(lang, 'ai_persona_custom_failed') || 'Failed to save custom persona.'));
        }
        return true;
    }

    return {
        getUserCustomPersona,
        getUserPersona,
        setUserPersona,
        getPersonaPrompt,
        buildPersonaKeyboard,
        rememberCustomPersonaPrompt,
        promptCustomPersonaInput,
        handleCustomPersonaReply,
        getPersonaLabel
    };
}

module.exports = {
    AI_PERSONAS,
    createPersonaHandlers
};
