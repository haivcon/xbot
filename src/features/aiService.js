const axios = require('axios');

const OpenAI = require('openai');

const { GoogleGenAI } = require('@google/genai');

const { createCanvas, loadImage } = require('canvas');



const { bot } = require('../core/bot');

const { t } = require('../core/i18n');

const { sanitizeSecrets } = require('../core/sanitize');

const { appendCloseButton } = require('../features/ui');

const { chunkInlineButtons } = require('../utils/helpers');

const { escapeHtml } = require('../utils/text');

const {

    TELEGRAM_TOKEN,

    GEMINI_API_KEYS,

    GROQ_API_KEYS,

    OPENAI_API_KEYS,

    GEMINI_MODEL,

    GEMINI_MODEL_FAMILIES,

    GEMINI_THINKING_LEVELS,

    GEMINI_DEFAULT_MODEL_FAMILY,

    GEMINI_TTS_MODEL,

    GEMINI_TTS_VOICE,

    GEMINI_TTS_VOICE_OPTIONS,

    GEMINI_TTS_VOICES,

    GEMINI_TTS_LANG_OPTIONS,

    GEMINI_TTS_LANG_CODES,

    GEMINI_TTS_SAMPLE_RATE,

    GEMINI_TTS_CHANNELS,

    GEMINI_TTS_BIT_DEPTH,

    GROQ_MODEL,

    GROQ_VISION_MODEL,

    GROQ_API_URL,

    OPENAI_MODEL,

    OPENAI_VISION_MODEL,

    OPENAI_IMAGE_MODEL,

    OPENAI_IMAGE_VARIATION_MODEL,

    OPENAI_TRANSCRIBE_MODEL,

    OPENAI_TTS_MODEL,

    OPENAI_TTS_VOICE,

    OPENAI_TTS_FORMAT,

    OPENAI_AUDIO_MODEL,

    AI_IMAGE_MAX_BYTES,

    AI_IMAGE_DOWNLOAD_TIMEOUT_MS,

    AI_KEY_PROBE_TIMEOUT_MS

} = require('../config/env');

const {

    geminiClientPool,

    disabledGeminiKeyIndices,

    disabledGroqKeyIndices,

    disabledOpenAiKeyIndices,

    openAiClientPool,

    aiApiMenuStates,

    userTtsSettings,

    userGeminiModelPreferences,

    userGeminiKeyIndices,

    userDisabledGeminiKeyIndices,

    userGroqKeyIndices,

    userDisabledGroqKeyIndices,

    userOpenAiKeyIndices,

    userDisabledOpenAiKeyIndices,

    userExpiredKeyNotices

} = require('../core/state');



// Database for persisting AI model preferences

let db = null;

function setDatabase(database) {

    db = database;

}



const aiState = { geminiKeyIndex: 0, groqKeyIndex: 0, openAiKeyIndex: 0 };



function normalizeAiProvider(provider) {

    const normalized = (provider || '').toString().trim().toLowerCase();

    if (normalized === 'groq') {

        return 'groq';

    }

    if (normalized === 'openai' || normalized === 'chatgpt') {

        return 'openai';

    }

    return 'google';

}



function buildAiProviderMeta(lang, provider) {

    const normalized = normalizeAiProvider(provider);

    if (normalized === 'openai') {

        return {

            id: 'openai',

            icon: ' 💬',

            label: t(lang, 'ai_provider_openai'),

            menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_openai') }),

            menuHint: t(lang, 'ai_api_menu_hint_openai'),

            addHint: t(lang, 'ai_api_add_hint_openai'),

            addPrompt: t(lang, 'ai_api_add_prompt_openai'),

            addPlaceholder: t(lang, 'ai_api_add_placeholder_openai'),

            getKeyLabel: t(lang, 'ai_api_get_key_openai'),

            getKeyUrl: 'https://platform.openai.com/api-keys',

            infoTitle: t(lang, 'ai_api_info_title'),

            infoText: [

                t(lang, 'ai_api_usecases_openai', { url: 'https://platform.openai.com/api-keys' }),

                t(lang, 'ai_api_audio_openai'),

                t(lang, 'ai_api_image_notes_openai')

            ]

                .filter(Boolean)

                .join('\n\n')

        };

    }

    if (normalized === 'groq') {

        return {

            id: 'groq',

            icon: '⚡',

            label: t(lang, 'ai_provider_groq'),

            menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_groq') }),

            menuHint: t(lang, 'ai_api_menu_hint_groq'),

            addHint: t(lang, 'ai_api_add_hint_groq'),

            addPrompt: t(lang, 'ai_api_add_prompt_groq'),

            addPlaceholder: t(lang, 'ai_api_add_placeholder_groq'),

            getKeyLabel: t(lang, 'ai_api_get_key_groq'),

            getKeyUrl: 'https://console.groq.com/keys',

            infoTitle: t(lang, 'ai_api_info_title'),

            infoText: t(lang, 'ai_api_usecases_groq', { url: 'https://console.groq.com/keys' })

        };

    }



    return {

        id: 'google',

        icon: '✨',

        label: t(lang, 'ai_provider_google'),

        menuTitle: t(lang, 'ai_api_menu_title_provider', { provider: t(lang, 'ai_provider_google') }),

        menuHint: t(lang, 'ai_api_menu_hint'),

        addHint: t(lang, 'ai_api_add_hint'),

        addPrompt: t(lang, 'ai_api_add_prompt'),

        addPlaceholder: t(lang, 'ai_api_add_placeholder'),

        getKeyLabel: t(lang, 'ai_api_get_key'),

        getKeyUrl: 'https://aistudio.google.com/api-keys',

        infoTitle: t(lang, 'ai_api_info_title'),

        infoText: [

            t(lang, 'ai_api_usecases_google', { url: 'https://aistudio.google.com/api-keys' }),

            t(lang, 'ai_api_audio_google'),

            t(lang, 'ai_api_image_notes_google')

        ]

            .filter(Boolean)

            .join('\n\n')

    };

}



function extractGoogleCandidateText(data) {

    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

    for (const candidate of candidates) {

        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

        const text = parts.map((part) => part?.text || '').join('').trim();

        if (text) {

            return text;

        }

    }

    return '';

}



async function probeGoogleApiKey(apiKey) {

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {

        const response = await axios.post(

            url,

            {

                contents: [{ role: 'user', parts: [{ text: 'ping' }] }],

                generationConfig: { maxOutputTokens: 1 }

            },

            { timeout: AI_KEY_PROBE_TIMEOUT_MS }

        );

        // Consider the key valid if the service accepts the request, even when

        // the reply is empty (e.g., MAX_TOKENS with 0 content) to avoid

        // deleting working keys used by multiple users.

        if (response?.status && response.status >= 200 && response.status < 300) {

            return true;

        }



        return Boolean(extractGoogleCandidateText(response?.data));

    } catch (error) {

        const status = error?.response?.status;

        const errorCode = (error?.response?.data?.error?.status || '').toString().toUpperCase();

        const retryableStatuses = [429, 500, 502, 503, 504];

        const retryableCodes = new Set(['RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']);



        if (retryableStatuses.includes(status) || retryableCodes.has(errorCode)) {

            // Treat transient or quota-related errors as inconclusive to avoid removing valid keys.

            return true;

        }



        return false;

    }

}



async function probeGroqApiKey(apiKey) {

    try {

        const response = await axios.post(

            GROQ_API_URL,

            {

                messages: [{ role: 'user', content: 'ping' }],

                model: GROQ_MODEL,

                max_tokens: 1

            },

            {

                headers: {

                    Authorization: `Bearer ${apiKey}`,

                    'Content-Type': 'application/json'

                },

                timeout: AI_KEY_PROBE_TIMEOUT_MS

            }

        );

        const choices = Array.isArray(response?.data?.choices) ? response.data.choices : [];

        return choices.some((choice) => (choice?.message?.content || '').toString().trim());

    } catch (error) {

        return false;

    }

}



async function isUserApiKeyValid(entry) {

    const apiKey = (entry?.apiKey || '').trim();

    if (!apiKey) {

        return false;

    }

    const provider = normalizeAiProvider(entry.provider || 'google');

    if (provider === 'groq') {

        return probeGroqApiKey(apiKey);

    }

    return probeGoogleApiKey(apiKey);

}



function rememberAiApiMenuState(message, options = {}) {

    if (!message?.chat?.id || !message?.message_id) {

        return;

    }

    const key = `${message.chat.id}:${message.message_id}`;

    aiApiMenuStates.set(key, {

        backCallbackData: options.backCallbackData || null,

        provider: normalizeAiProvider(options.provider || 'google')

    });

}



function getAiApiMenuState(message) {

    if (!message?.chat?.id || !message?.message_id) {

        return null;

    }

    const key = `${message.chat.id}:${message.message_id}`;

    return aiApiMenuStates.get(key) || null;

}



function buildAiApiMenu(keys, lang, provider = 'google', page = 0, options = {}) {

    const meta = buildAiProviderMeta(lang, provider);

    const entries = Array.isArray(keys)

        ? keys.filter((entry) => normalizeAiProvider(entry.provider) === meta.id)

        : [];

    const pageSize = 5;

    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));

    const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);

    const start = currentPage * pageSize;

    const slice = entries.slice(start, start + pageSize);

    // Helper: pad string to width
    const pad = (str, len) => {
        const s = String(str || '');
        return s.length >= len ? s.substring(0, len) : s + ' '.repeat(len - s.length);
    };
    const padStart = (str, len) => {
        const s = String(str || '');
        return s.length >= len ? s.substring(0, len) : ' '.repeat(len - s.length) + s;
    };

    // Build ASCII table for API Keys
    const nameCol = t(lang, 'ai_api_default_name') || 'Name';
    const keyCol = 'API Key';
    const col1Width = 12;
    const col2Width = 18;

    const topBorder = `╔${'═'.repeat(col1Width)}╦${'═'.repeat(col2Width)}╗`;
    const headerRow = `║${pad(nameCol, col1Width)}║${pad(keyCol, col2Width)}║`;
    const midBorder = `╠${'═'.repeat(col1Width)}╬${'═'.repeat(col2Width)}╣`;
    const rowSeparator = `╠${'═'.repeat(col1Width)}╬${'═'.repeat(col2Width)}╣`;
    const bottomBorder = `╚${'═'.repeat(col1Width)}╩${'═'.repeat(col2Width)}╝`;

    // Build table rows
    const tableRows = [];
    if (slice.length > 0) {
        slice.forEach((entry, idx) => {
            const nameLabel = entry.name && entry.name.trim() ? entry.name.trim() : (t(lang, 'ai_api_default_name') || 'Key');
            const maskedKey = maskApiKey(entry.apiKey);
            const row = `║${pad(nameLabel.substring(0, col1Width), col1Width)}║${pad(maskedKey, col2Width)}║`;
            tableRows.push(row);
            if (idx < slice.length - 1) {
                tableRows.push(rowSeparator);
            }
        });
    } else {
        const emptyLabel = t(lang, 'ai_api_empty') || 'No keys';
        const emptyRow = `║${pad(emptyLabel.substring(0, col1Width + col2Width - 2), col1Width + col2Width + 1)}║`;
        // For empty state, create single column row
        tableRows.push(`║${pad(emptyLabel.substring(0, 30), 30)}║`);
    }

    // Build table string
    let table;
    if (slice.length > 0) {
        table = [topBorder, headerRow, midBorder, ...tableRows, bottomBorder].join('\n');
    } else {
        const emptyBorder1 = `╔${'═'.repeat(30)}╗`;
        const emptyLabel = t(lang, 'ai_api_empty') || 'No API keys';
        const emptyRow = `║${pad(emptyLabel.substring(0, 30), 30)}║`;
        const emptyBorder2 = `╚${'═'.repeat(30)}╝`;
        table = [emptyBorder1, emptyRow, emptyBorder2].join('\n');
    }

    const lines = [
        `${meta.icon} <b>${meta.menuTitle}</b>`,
        '',
        `<pre>${table}</pre>`
    ];

    // Add total keys count
    if (entries.length > 0) {
        lines.push(`${t(lang, 'ai_api_list_title', { count: entries.length })}`);
    }

    // Current provider info
    if (options.defaultProvider && normalizeAiProvider(options.defaultProvider) === meta.id) {
        lines.push(t(lang, 'ai_provider_current', { provider: meta.label }));
    }

    // Show current model info for Google AI
    if (meta.id === 'google') {
        const hasPersonalKeys = entries.length > 0;
        if (hasPersonalKeys && options.userId) {
            const userModelConfig = getUserGeminiModelConfig(options.userId);
            const modelLabel = userModelConfig.modelConfig?.label || 'Gemini 2.5 Flash';
            let modelInfo = `🧠 <b>${t(lang, 'ai_model_current', { model: modelLabel })}</b>`;
            if (userModelConfig.modelConfig?.supportsThinking && userModelConfig.thinkingLevel) {
                const levelLabel = userModelConfig.thinkingLevel === 'high'
                    ? t(lang, 'ai_thinking_level_high')
                    : t(lang, 'ai_thinking_level_low');
                modelInfo += `\n${t(lang, 'ai_thinking_level_current', { level: levelLabel })}`;
            }
            lines.push(modelInfo);
        } else {
            lines.push(`🧠 <b>${t(lang, 'ai_model_current', { model: 'Gemini 2.5 Flash' })}</b> (${t(lang, 'ai_model_server_default')})`);
        }

        if (options.personaInfo) {
            const personaLabel = escapeHtml(options.personaInfo.name || options.personaInfo.id || 'default');
            const personaLine = t(lang, 'ai_persona_current_info', { name: personaLabel }) || personaLabel;
            lines.push(`🎭 ${personaLine}`);
        }

        // Display current voice and language settings
        if (options.ttsConfig) {
            const voiceMeta = getGeminiTtsVoiceMeta(options.ttsConfig.voice);
            const voiceIcon = voiceMeta?.gender === 'female' ? '👩' : voiceMeta?.gender === 'male' ? '👨' : '🎙️';
            const voiceName = options.ttsConfig.voice || GEMINI_TTS_VOICE;
            const langMeta = getGeminiTtsLanguageMeta(options.ttsConfig.language);
            const langDisplay = options.ttsConfig.language === 'auto' || !langMeta
                ? (t(lang, 'ai_tts_lang_auto') || 'Auto')
                : `${langMeta.flag} ${langMeta.code}`;
            lines.push(`🗣️ ${t(lang, 'ai_tts_voice_label') || 'Voice'}: ${voiceIcon} ${voiceName} | ${t(lang, 'ai_tts_language_label') || 'Language'}: ${langDisplay}`);
        }

        // Image generation keywords note for Google - localized for each language
        lines.push('');
        lines.push(`<b>🎨 ${t(lang, 'ai_api_image_keywords_title') || 'Image generation keywords'}:</b>`);

        // Localized keywords for image generation
        const genKeywords = {
            en: 'draw, create, generate, make, design, render, paint, sketch, image, photo, picture',
            vi: 'vẽ, tạo, tạo ảnh, làm, thiết kế, hình, ảnh, tranh, bức ảnh, dựng hình',
            zh: '画, 生成, 制作, 做一张, 图片, 照片, 插画, 画一个, 给我画, 帮我画',
            ko: '그려, 그려줘, 만들어, 생성해, 렌더, 디자인, 사진, 이미지, 그림',
            ru: 'создать, сделай, нарисуй, нарисовать, сгенерируй, изображение, картинку, фото',
            id: 'buat, bikin, lukis, gambar, buatkan, foto, ilustrasi, desain'
        };
        lines.push(`<code>${genKeywords[lang] || genKeywords.en}</code>`);
        lines.push(`💡 ${t(lang, 'ai_api_image_keywords_hint') || 'Use these keywords at the start of your message to generate images.'}`);

        // Image editing keywords
        lines.push('');
        lines.push(`<b>✏️ ${t(lang, 'ai_api_edit_keywords_title') || 'Image editing keywords'}:</b>`);

        const editKeywords = {
            en: 'edit, edit image, edit photo, remove background, change background, replace',
            vi: 'chỉnh sửa, sửa ảnh, chỉnh ảnh, xóa phông, tách nền, thay đổi ảnh, cắt nền',
            zh: '编辑, 编辑图片, 编辑照片, 去背景, 移除背景, 替换背景, 更改背景',
            ko: '편집, 사진 편집, 이미지 편집, 배경 제거, 배경 바꿔, 배경 바꾸기',
            ru: 'редактировать, редактировать фото, удалить фон, замени фон, сменить фон',
            id: 'edit, edit gambar, edit foto, hapus latar, ganti background, ganti latar'
        };
        lines.push(`<code>${editKeywords[lang] || editKeywords.en}</code>`);
        lines.push(`💡 ${t(lang, 'ai_api_edit_keywords_hint') || 'Reply to an image with these keywords to edit it.'}`);
    }

    // Provider-specific quick guide
    lines.push('');
    lines.push(`<b>📖 ${t(lang, 'ai_api_info_title') || 'Quick Guide'}:</b>`);
    lines.push(`${meta.addHint}`);
    lines.push(`🔗 <a href="${meta.getKeyUrl}">${meta.getKeyLabel}</a>`);

    const inline_keyboard = [];
    if (meta.id === 'google') {
        inline_keyboard.push([{ text: `🗣️ ${t(lang, 'ai_tts_settings_button')}`, callback_data: `ttssettings|${currentPage}` }]);
        // Only show model selection button if user has personal API keys
        if (entries.length > 0) {
            inline_keyboard.push([{ text: `🧠 ${t(lang, 'ai_model_settings_button')}`, callback_data: 'geminimodel|select' }]);
        }
        inline_keyboard.push([{ text: `🎭 ${t(lang, 'ai_persona_settings_button')}`, callback_data: 'aipersona_menu' }]);
        inline_keyboard.push([{ text: `🙋 ${t(lang, 'ai_profile_settings_button') || 'Personal info'}`, callback_data: 'profile_prompt' }]);
    }

    inline_keyboard.push([{ text: `➕ ${t(lang, 'ai_api_add_button')}`, callback_data: `aiapi|add|${meta.id}` }]);

    if (slice.length) {
        slice.forEach((entry) => {
            const label = entry.name && entry.name.trim() ? entry.name.trim() : t(lang, 'ai_api_default_name');
            inline_keyboard.push([
                { text: `📋 ${t(lang, 'ai_api_copy_button')}`, callback_data: `aiapi|copy|${meta.id}|${entry.id}|${currentPage}` },
                { text: `🗑️ ${label}`, callback_data: `aiapi|del|${meta.id}|${entry.id}|${currentPage}` }
            ]);
        });
    }

    inline_keyboard.push([{ text: `⭐ ${t(lang, 'ai_provider_set_default', { provider: meta.label })}`, callback_data: `aiapi|default|${meta.id}` }]);

    if (totalPages > 1) {
        const prevPage = Math.max(0, currentPage - 1);
        const nextPage = Math.min(totalPages - 1, currentPage + 1);
        inline_keyboard.push([
            { text: '⬅️', callback_data: `aiapi|page|${meta.id}|${prevPage}` },
            { text: `${currentPage + 1}/${totalPages}`, callback_data: 'aiapi|noop' },
            { text: '➡️', callback_data: `aiapi|page|${meta.id}|${nextPage}` }
        ]);
    }

    inline_keyboard.push([{ text: `${meta.icon} ${meta.getKeyLabel}`, url: meta.getKeyUrl }]);



    const reply_markup = appendCloseButton({ inline_keyboard }, lang, {

        backCallbackData: options.backCallbackData,

        closeCallbackData: options.closeCallbackData || 'ui_close'

    });



    return {

        text: lines.filter(Boolean).join('\n'),

        reply_markup

    };

}



function parseAiApiSubmission(rawText) {

    if (!rawText || typeof rawText !== 'string') {

        return [];

    }



    const entries = [];

    const lines = rawText.split(/\n+/);



    for (const line of lines) {

        let working = line.trim();

        if (!working) {

            continue;

        }



        let name = null;

        let apiKey = null;

        let provider = null;



        const providerMatch = working.match(/^(groq|google|gemini|openai|chatgpt)\s*[|:\-]\s*(.+)$/i);

        if (providerMatch) {

            const rawProvider = providerMatch[1].toLowerCase();

            provider = rawProvider === 'groq' ? 'groq' : rawProvider === 'openai' || rawProvider === 'chatgpt' ? 'openai' : 'google';

            working = providerMatch[2].trim();

        }



        const separatorMatch = working.match(/^(.*?)\s*[|:\-]\s*([A-Za-z0-9_-]{20,})$/i);

        if (separatorMatch) {

            name = separatorMatch[1].trim();

            apiKey = separatorMatch[2].trim();

        } else if (/AIza[\w-]{10,}/i.test(working) || /^sk-[\w-]{20,}/i.test(working) || working.length >= 20) {

            apiKey = working;

        }



        if (!apiKey) {

            continue;

        }



        if (!provider) {

            if (/^gsk_/i.test(apiKey)) {

                provider = 'groq';

            } else if (/^sk-[\w-]{10,}/i.test(apiKey)) {

                provider = 'openai';

            } else {

                provider = 'google';

            }

        }



        provider = normalizeAiProvider(provider);



        const safeName = name && name.length ? name : null;

        entries.push({ name: safeName, apiKey, provider });



        if (entries.length >= 10) {

            break;

        }

    }



    return entries;

}



async function urlToGenerativePart(url, mimeType, options = {}) {

    const { timeoutMs = AI_IMAGE_DOWNLOAD_TIMEOUT_MS, maxBytes = AI_IMAGE_MAX_BYTES } = options;

    const response = await axios.get(url, {

        responseType: 'arraybuffer',

        timeout: timeoutMs,

        maxContentLength: maxBytes,

        maxBodyLength: maxBytes

    });

    const base64Data = Buffer.from(response.data).toString('base64');

    return {

        inlineData: {

            data: base64Data,

            mimeType

        }

    };

}



function bufferToGenerativePart(buffer, mimeType = 'image/png') {

    if (!buffer || !Buffer.isBuffer(buffer)) {

        throw new Error('Invalid buffer for generative part');

    }



    return {

        inlineData: {

            data: buffer.toString('base64'),

            mimeType

        }

    };

}



function detectImageAction(promptText, hasPhoto = false) {

    const normalized = (promptText || '').toLowerCase();

    if (!normalized.trim()) {

        return null;

    }



    const technicalContextKeywords = [

        'image processing',

        'computer vision',

        'classification model',

        'dataset',

        'data set',

        'pipeline',

        'model training',

        'segmentation model'

    ];



    const imageNouns = [

        'image', 'photo', 'picture', 'pic', 'wallpaper', 'artwork', 'art', 'drawing', 'sketch', 'logo', 'avatar', 'poster', 'banner', 'meme', 'sticker', 'cover', 'illustration',

        'ảnh', 'hình', 'hình ảnh', 'bức ảnh', 'bức hình', 'bức tranh', 'tấm ảnh', 'tấm hình', 'tranh', 'ảnh nền', 'avatar',

        '圖片', '图片', '照片', '圖像', '图像', '畫', '画', '插畫', '插画', '壁紙', '壁纸', '海報', '海报', '貼紙', '贴纸', '头像', '頭像',

        'изображение', 'картинку', 'картинка', 'фото', 'рисунок', 'аватар', 'обложка', 'баннер', 'постер',

        '사진', '이미지', '그림', '스케치', '로고', '아바타', '포스터', '배너', '스티커', '배경',

        'gambar', 'foto', 'ilustrasi', 'wallpaper', 'logo', 'avatar', 'poster', 'stiker', 'sampul'

    ];



    const createVerbs = [

        'create', 'generate', 'make', 'build', 'design', 'render', 'draw', 'paint', 'sketch', 'illustrate',

        'tạo', 'tao', 'vẽ', 've', 'làm', 'thiết kế', 'phác', 'phac', 'dựng hình', 'dung hinh',

        '生成', '制作', '做一张', '做个', '做一個', '画', '畫', '畫一個', '画一个', '画一张', '畫一張', '給我畫', '给我画', '帮我画', '幫我畫',

        'создать', 'сделай', 'нарисуй', 'нарисовать', 'сгенерируй', 'сгенерировать',

        '그리', '그려', '그려줘', '그려 줘', '만들어', '생성해', '렌더', '디자인',

        'buat', 'bikin', 'lukis', 'tolong gambar', 'buatkan', 'gambar-kan'

    ];



    const editKeywords = [

        'edit image', 'edit photo', 'remove background', 'change background', 'replace background',

        'chỉnh sửa', 'chỉnh ảnh', 'sửa ảnh', 'thay đổi ảnh', 'xóa phông', 'tách nền', 'lọc nền', 'cắt nền',

        '编辑图片', '编辑照片', '去背景', '移除背景', '替换背景', '更改背景',

        'редактировать изображение', 'редактировать фото', 'удалить фон', 'замени фон', 'сменить фон',

        '사진 편집', '이미지 편집', '배경 제거', '배경 바꿔', '배경 바꾸기',

        'edit gambar', 'edit foto', 'hapus latar', 'ganti background', 'ganti latar'

    ];



    const variationKeywords = [

        'variation', 'new version', 'another version', 'remix',

        'biến thể', 'phiên bản khác', 'phiên bản mới', 'biến tấu',

        '变体', '新版本', '另一版', '再来一版', '另一個版本', '新版本', '變體',

        'вариация', 'другую версию', 'новая версия', 'вариант',

        '다른 버전', '새 버전', '변형',

        'variasi', 'versi lain', 'versi baru'

    ];



    const strongCreatePhrases = [

        'draw me', 'draw a', 'draw an', 'paint me', 'paint a', 'design a logo', 'make a logo', 'make an avatar', 'render a', 'render an', 'generate a logo', 'generate an image', 'generate image of',

        'vẽ cho', 'vẽ giúp', 'vẽ một', 'vẽ con', 'vẽ cái', 'tạo hình', 'tạo ảnh', 'tạo bức', 'làm ảnh', 'làm hình', 'thiết kế logo', 'thiết kế hình', 'phác họa', 'phác hoạ',

        '生成一张', '生成一幅', '画一张', '画一个', '畫一張', '畫一個', '給我畫', '给我画', '幫我畫', '帮我画', '做一张图', '做个图', '做個圖',

        'сделай картинку', 'сделай фото', 'сделай аватар', 'сделай обложку', 'нарисуй мне', 'нарисуй картинку', 'сгенерируй картинку',

        '그려줘', '그림 그려', '그려 줘', '그림 하나', '이미지 만들어', '사진 만들어', '로고 만들어',

        'buat gambar', 'bikin gambar', 'tolong gambar', 'buatkan gambar', 'buatkan foto', 'buatkan logo', 'lukis gambar',

        '/imagine', 'midjourney', 'stable diffusion', 'sdxl', 'prompt:'

    ];



    const styleMarkers = [

        '4k', '8k', 'realistic', 'ultra realistic', 'hdr', 'cinematic', 'digital art', 'anime style', 'pixar style', 'concept art', 'wallpaper', 'high resolution'

    ];



    const hasImageNoun = imageNouns.some((keyword) => normalized.includes(keyword));

    const hasCreateVerb = createVerbs.some((keyword) => normalized.includes(keyword));

    const hasStyleMarker = styleMarkers.some((keyword) => normalized.includes(keyword));

    const hasStrongCreate = strongCreatePhrases.some((keyword) => normalized.includes(keyword));



    if (hasPhoto) {

        if (variationKeywords.some((keyword) => normalized.includes(keyword))) {

            return 'variation';

        }



        if (editKeywords.some((keyword) => normalized.includes(keyword))) {

            return 'edit';

        }

    }



    let confidence = 0;

    if (hasImageNoun) confidence += 2;

    if (hasCreateVerb) confidence += 1;

    if (hasStyleMarker) confidence += 1;

    if (hasStrongCreate) confidence += 2;



    const technicalContext = technicalContextKeywords.some((keyword) => normalized.includes(keyword));

    if (technicalContext && confidence < 4) {

        return null;

    }



    if (confidence >= 3) {

        return 'generate';

    }



    return null;

}



/**

 * AI-based intent classifier for ambiguous requests

 * Uses a quick LLM call to determine if user wants image generation

 * @param {Object} client - Gemini client

 * @param {string} promptText - User's message

 * @param {boolean} hasPhoto - Whether user attached a photo

 * @param {string} modelName - Model to use for classification (user's selected model)

 * @returns {Promise<string|null>} - 'generate', 'edit', 'variation', or null for chat

 */

async function classifyImageIntentWithAI(client, promptText, hasPhoto = false, modelName = 'gemini-2.0-flash') {

    if (!client || !promptText) {

        return null;

    }



    const systemPrompt = `You are an intent classifier. Analyze the user's message and determine their intent.

Reply with ONLY ONE of these exact words:

- "GENERATE" - if user wants to CREATE/DRAW/PAINT a NEW image from scratch (e.g., "draw a cat", "make me a picture of sunset", "????", "v? cho t“i con mŠo")

- "EDIT" - if user has attached an image and wants to MODIFY/CHANGE it (e.g., "remove the background", "change color to blue", "ch?nh s?a ?nh n…y")

- "VARIATION" - if user has attached an image and wants a SIMILAR VERSION (e.g., "make another version", "create variation", "t?o phiˆn b?n kh c")

- "CHAT" - for everything else (questions, coding help, text generation, explanations, translations, etc.)



Important:

- If the user asks to "help create code/text/document/summary", that is CHAT, not GENERATE

- If user says "draw conclusions" or "paint a picture" metaphorically, that is CHAT

- Only return GENERATE/EDIT/VARIATION if user explicitly wants an IMAGE/PHOTO/PICTURE

- When in doubt, return CHAT`;



    const userMessage = hasPhoto

        ? `[User attached an image] User message: "${promptText}"`

        : `User message: "${promptText}"`;



    try {

        console.log('[AI Intent] Using model:', modelName);

        const response = await Promise.race([

            client.models.generateContent({

                model: modelName, // Use user's selected model

                contents: [

                    { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }

                ],

                generationConfig: {

                    maxOutputTokens: 10,

                    temperature: 0.1

                }

            }),

            new Promise((_, reject) => setTimeout(() => reject(new Error('Intent classification timeout')), 5000))

        ]);



        const result = (response?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();

        console.log('[AI Intent] Raw result:', result);



        if (result === 'GENERATE') return 'generate';

        if (result === 'EDIT') return 'edit';

        if (result === 'VARIATION') return 'variation';

        return null; // CHAT or unknown

    } catch (error) {

        console.warn('[AI Intent] Classification failed:', error.message);

        return null; // Fall back to keyword detection

    }

}



function isQuotaOrRateLimitError(error) {

    const status = error?.response?.status;

    const code = error?.response?.data?.error?.code || error?.code;

    const message = (error?.response?.data?.error?.message || error?.message || '').toLowerCase();



    return status === 429

        || status === 402

        || code === 'insufficient_quota'

        || message.includes('quota')

        || message.includes('rate limit')

        || message.includes('hard limit has been reached');

}



function isOpenAiBillingError(error) {

    const status = error?.response?.status;

    const message = (error?.response?.data?.error?.message || error?.message || '').toLowerCase();



    return status === 400 && message.includes('hard limit has been reached');

}



function isGeminiApiKeyExpired(error) {

    const status = error?.response?.status;

    const message = (error?.response?.data?.error?.message || error?.message || '').toLowerCase();

    const details = Array.isArray(error?.response?.data?.error?.details)

        ? error.response.data.error.details

        : [];

    const hasExpiredDetail = details.some((detail) => detail?.reason === 'API_KEY_INVALID');



    return status === 400 && (message.includes('api key expired') || hasExpiredDetail);

}



async function downloadTelegramPhotoBuffer(photo, options = {}) {

    const { timeoutMs = AI_IMAGE_DOWNLOAD_TIMEOUT_MS, maxBytes = AI_IMAGE_MAX_BYTES } = options;

    const fileInfo = await bot.getFile(photo.file_id);

    const fileSize = Number(photo.file_size || fileInfo?.file_size || 0);

    const maxMb = Math.max(1, Math.ceil(maxBytes / (1024 * 1024)));



    if (fileSize && fileSize > maxBytes) {

        return { error: 'too_large', limitMb: maxMb };

    }



    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;

    const response = await axios.get(fileUrl, {

        responseType: 'arraybuffer',

        timeout: timeoutMs,

        maxContentLength: maxBytes,

        maxBodyLength: maxBytes

    });



    return { buffer: Buffer.from(response.data), mimeType: photo.mime_type || 'image/jpeg' };

}



async function convertImageToPngSquare(buffer) {

    const image = await loadImage(buffer);

    const size = Math.min(image.width || 0, image.height || 0);



    if (!size) {

        throw new Error('Invalid image dimensions');

    }



    const offsetX = Math.max(0, Math.floor((image.width - size) / 2));

    const offsetY = Math.max(0, Math.floor((image.height - size) / 2));

    const canvas = createCanvas(size, size);

    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, -offsetX, -offsetY);



    return canvas.toBuffer('image/png');

}



function buildGroqMessageContent(parts, fallbackText) {

    const content = [];



    for (const part of parts || []) {

        if (part?.text) {

            const text = String(part.text).trim();

            if (text) {

                content.push({ type: 'text', text });

            }

            continue;

        }



        const inlineData = part?.inlineData;

        if (inlineData?.data) {

            const mimeType = inlineData.mimeType || 'image/jpeg';

            const dataUrl = `data:${mimeType};base64,${inlineData.data}`;

            content.push({ type: 'image_url', image_url: { url: dataUrl } });

        }

    }



    if (!content.length && fallbackText) {

        content.push({ type: 'text', text: fallbackText });

    }



    return content;

}



function getGeminiClient(index = aiState.geminiKeyIndex, keys = GEMINI_API_KEYS) {

    if (!Array.isArray(keys) || !keys.length) {

        return null;

    }



    const safeIndex = ((index % keys.length) + keys.length) % keys.length;

    const apiKey = keys[safeIndex];



    if (!geminiClientPool.has(apiKey)) {

        geminiClientPool.set(apiKey, new GoogleGenAI({ apiKey }));

    }



    return { client: geminiClientPool.get(apiKey), apiKey, index: safeIndex };

}



function disableGeminiKey(index, reason = 'disabled') {

    if (!GEMINI_API_KEYS.length) {

        return;

    }



    const safeIndex = ((index % GEMINI_API_KEYS.length) + GEMINI_API_KEYS.length) % GEMINI_API_KEYS.length;

    if (disabledGeminiKeyIndices.has(safeIndex)) {

        return;

    }



    disabledGeminiKeyIndices.add(safeIndex);

    console.warn(`[AI] Disabled Gemini key index ${safeIndex}: ${sanitizeSecrets(reason)}`);



    if (disabledGeminiKeyIndices.size >= GEMINI_API_KEYS.length) {

        console.error('[AI] All Gemini API keys are disabled');

    }

}



function disableUserGeminiKey(userId, index, total, reason = 'error', keyName = null) {

    if (!userId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {

        return;

    }



    const set = userDisabledGeminiKeyIndices.get(userId) || new Set();

    const safeIndex = ((index % total) + total) % total;

    if (set.has(safeIndex)) {

        return;

    }

    set.add(safeIndex);

    userDisabledGeminiKeyIndices.set(userId, set);


    // Store failure info for notification to user
    const notices = userExpiredKeyNotices.get(userId) || new Map();
    notices.set(safeIndex, {
        reason,
        keyName,
        timestamp: Date.now()
    });
    userExpiredKeyNotices.set(userId, notices);
    console.log(`[AI] Stored key failure notice for user ${userId}, key index ${safeIndex}: ${reason}`);

}



function getUserGeminiKeyIndex(userId) {

    const current = Number(userGeminiKeyIndices.get(userId));

    return Number.isInteger(current) ? current : 0;

}



function setUserGeminiKeyIndex(userId, index) {

    if (!userId || !Number.isInteger(index)) {

        return;

    }

    userGeminiKeyIndices.set(userId, index);

}

/**
 * Get and clear expired key notices for a user
 * Returns array of { keyIndex, reason, keyName }
 */
function getAndClearExpiredKeyNotices(userId) {
    if (!userId) return [];

    const notices = userExpiredKeyNotices.get(userId);
    if (!notices || notices.size === 0) return [];

    const result = [];
    for (const [keyIndex, info] of notices.entries()) {
        result.push({
            keyIndex,
            reason: info.reason,
            keyName: info.keyName
        });
    }

    // Clear after reading
    userExpiredKeyNotices.delete(userId);
    return result;
}

/**
 * Check if user has any expired key notices pending
 */
function hasExpiredKeyNotices(userId) {
    if (!userId) return false;
    const notices = userExpiredKeyNotices.get(userId);
    return notices && notices.size > 0;
}



function getGeminiTtsVoiceMeta(name) {

    return GEMINI_TTS_VOICE_OPTIONS.find((voice) => voice.name === name) || null;

}



function getGeminiTtsLanguageMeta(code) {

    return GEMINI_TTS_LANG_OPTIONS.find((option) => option.code === code) || null;

}



function formatTtsVoiceLabel(voice) {

    const meta = getGeminiTtsVoiceMeta(voice);

    const icon = meta?.gender === 'female' ? '👩' : meta?.gender === 'male' ? '👨' : '🤖';

    return `${icon} ${meta?.name || voice || GEMINI_TTS_VOICE}`;

}



function formatTtsLanguageLabel(code, lang) {

    const meta = getGeminiTtsLanguageMeta(code);

    if (!meta || code === 'auto') {

        return `${meta?.flag || '🏳️'} ${t(lang, 'ai_tts_lang_auto')}`;

    }



    return `${meta.flag} ${meta.code}${meta.label ? ` · ${meta.label}` : ''}`;

}



async function getUserTtsConfig(userId) {
    // Check in-memory cache first
    if (userId && userTtsSettings.has(userId)) {
        const stored = userTtsSettings.get(userId);
        const voice = stored?.voice && GEMINI_TTS_VOICES.includes(stored.voice) ? stored.voice : GEMINI_TTS_VOICE;
        const language = stored?.language && GEMINI_TTS_LANG_CODES.includes(stored.language) ? stored.language : 'auto';
        return { voice, language };
    }

    // Hydrate from DB if not in memory
    if (userId && db?.getTtsSettings) {
        try {
            const dbSettings = await db.getTtsSettings(userId);
            if (dbSettings) {
                const voice = dbSettings.voice && GEMINI_TTS_VOICES.includes(dbSettings.voice) ? dbSettings.voice : GEMINI_TTS_VOICE;
                const language = dbSettings.language && GEMINI_TTS_LANG_CODES.includes(dbSettings.language) ? dbSettings.language : 'auto';
                // Cache for next time
                userTtsSettings.set(userId, { voice, language });
                return { voice, language };
            }
        } catch (e) {
            console.warn('[TTS] Failed to hydrate from DB:', e.message);
        }
    }

    // Return defaults
    return { voice: GEMINI_TTS_VOICE, language: 'auto' };
}



async function saveUserTtsVoice(userId, voice) {
    if (!userId || !voice || !GEMINI_TTS_VOICES.includes(voice)) {
        return getUserTtsConfig(userId);
    }

    const current = await getUserTtsConfig(userId);
    const next = { ...current, voice };
    userTtsSettings.set(userId, next);

    // Persist to DB
    if (db?.saveTtsSettings) {
        db.saveTtsSettings(userId, next.voice, next.language).catch(e => {
            console.warn('[TTS] Failed to save voice to DB:', e.message);
        });
    }

    return next;
}

async function saveUserTtsLanguage(userId, language) {
    if (!userId || !language || !GEMINI_TTS_LANG_CODES.includes(language)) {
        return getUserTtsConfig(userId);
    }

    const current = await getUserTtsConfig(userId);
    const next = { ...current, language };
    userTtsSettings.set(userId, next);

    // Persist to DB
    if (db?.saveTtsSettings) {
        db.saveTtsSettings(userId, next.voice, next.language).catch(e => {
            console.warn('[TTS] Failed to save language to DB:', e.message);
        });
    }

    return next;
}



// ============ Gemini Model Selection Functions ============



function getGeminiModelConfig(modelFamilyId) {

    const id = (modelFamilyId || GEMINI_DEFAULT_MODEL_FAMILY).toString().trim();

    return GEMINI_MODEL_FAMILIES[id] || GEMINI_MODEL_FAMILIES[GEMINI_DEFAULT_MODEL_FAMILY];

}



function getUserGeminiModelConfig(userId) {

    const stored = userId ? userGeminiModelPreferences.get(userId) : null;

    const modelFamily = stored?.modelFamily && GEMINI_MODEL_FAMILIES[stored.modelFamily]

        ? stored.modelFamily

        : GEMINI_DEFAULT_MODEL_FAMILY;

    const modelConfig = getGeminiModelConfig(modelFamily);

    const thinkingLevel = modelConfig.supportsThinking

        ? (stored?.thinkingLevel && GEMINI_THINKING_LEVELS.includes(stored.thinkingLevel)

            ? stored.thinkingLevel

            : modelConfig.defaultThinkingLevel)

        : null;

    return { modelFamily, thinkingLevel, modelConfig };

}



function saveUserGeminiModel(userId, modelFamilyId) {

    if (!userId || !modelFamilyId || !GEMINI_MODEL_FAMILIES[modelFamilyId]) {

        return getUserGeminiModelConfig(userId);

    }



    const current = userGeminiModelPreferences.get(userId) || {};

    const modelConfig = getGeminiModelConfig(modelFamilyId);

    const thinkingLevel = modelConfig.supportsThinking

        ? (current.thinkingLevel && GEMINI_THINKING_LEVELS.includes(current.thinkingLevel)

            ? current.thinkingLevel

            : modelConfig.defaultThinkingLevel)

        : null;

    const next = { modelFamily: modelFamilyId, thinkingLevel };

    userGeminiModelPreferences.set(userId, next);



    // Persist to database (async, fire-and-forget)

    if (db && db.saveUserAiModelPreferences) {

        db.saveUserAiModelPreferences(userId, { modelFamily: modelFamilyId, thinkingLevel }).catch((err) => {

            console.error('[AiService] Failed to save model preference:', err.message);

        });

    }



    return { ...next, modelConfig };

}



function saveUserThinkingLevel(userId, level) {

    if (!userId || !level || !GEMINI_THINKING_LEVELS.includes(level)) {

        return getUserGeminiModelConfig(userId);

    }



    const current = userGeminiModelPreferences.get(userId) || {};

    const modelFamily = current.modelFamily || GEMINI_DEFAULT_MODEL_FAMILY;

    const modelConfig = getGeminiModelConfig(modelFamily);



    // Only save thinking level if the model supports it

    if (!modelConfig.supportsThinking) {

        return getUserGeminiModelConfig(userId);

    }



    const next = { modelFamily, thinkingLevel: level };

    userGeminiModelPreferences.set(userId, next);



    // Persist to database (async, fire-and-forget)

    if (db && db.saveUserAiModelPreferences) {

        db.saveUserAiModelPreferences(userId, { thinkingLevel: level }).catch((err) => {

            console.error('[AiService] Failed to save thinking level:', err.message);

        });

    }



    return { ...next, modelConfig };

}



function buildGeminiModelSelectionKeyboard(lang, currentModelFamily, currentThinkingLevel) {

    const inline_keyboard = [];



    // Model selection buttons

    Object.values(GEMINI_MODEL_FAMILIES).forEach((model) => {

        const isSelected = model.id === currentModelFamily;

        const checkmark = isSelected ? '✅ ' : '';

        inline_keyboard.push([{

            text: `${checkmark}${model.icon} ${model.label}`,

            callback_data: `geminimodel|set|${model.id}`

        }]);

    });



    // Thinking level buttons (only for Gemini 3 Pro)

    const currentConfig = getGeminiModelConfig(currentModelFamily);

    if (currentConfig.supportsThinking) {

        inline_keyboard.push([{ text: `━━━ ${t(lang, 'ai_thinking_level_title')} ━━━`, callback_data: 'geminimodel|noop' }]);

        const levelButtons = GEMINI_THINKING_LEVELS.map((level) => {

            const isSelected = level === currentThinkingLevel;

            const icon = level === 'high' ? '🔥' : '⚡';

            const checkmark = isSelected ? '✅ ' : '';

            const labelKey = level === 'high' ? 'ai_thinking_level_high' : 'ai_thinking_level_low';

            return {

                text: `${checkmark}${icon} ${t(lang, labelKey)}`,

                callback_data: `geminimodel|thinking|${level}`

            };

        });

        inline_keyboard.push(levelButtons);

    }



    // Back and close buttons

    inline_keyboard.push([

        { text: `🔙 ${t(lang, 'action_back')}`, callback_data: 'geminimodel|back' },

        { text: `✖️ ${t(lang, 'action_close')}`, callback_data: 'ui_close' }

    ]);



    return { inline_keyboard };

}



function buildGeminiModelSelectionText(lang, currentModelFamily, currentThinkingLevel) {
    const config = getGeminiModelConfig(currentModelFamily);

    // Detailed descriptions for each model (keys MUST match GEMINI_MODEL_FAMILIES in env.js)
    const modelDetails = {
        'gemini-3.1-pro': {
            features: t(lang, 'ai_model_3pro_detail') || '✅ Chat, Thinking mode, Function calling\n✅ Best reasoning, most capable\n❌ No image/audio generation',
            target: t(lang, 'ai_model_3pro_who') || '👤 For: Pro/Ultra subscribers\n⚠️ Higher rate limits, best performance'
        },
        'gemini-3-flash': {
            features: t(lang, 'ai_model_3flash_detail') || '✅ Chat, Thinking mode, Function calling\n✅ Multimodal understanding, agentic\n❌ No image/audio generation',
            target: t(lang, 'ai_model_3flash_who') || '👤 For: All Google accounts\n⚡ Powerful & fast, best balance'
        },
        'gemini-3.1-flash-lite': {
            features: t(lang, 'ai_model_lite_detail') || '✅ Chat, Thinking mode, Function calling\n✅ Fastest response, lowest cost\n❌ No image/audio generation',
            target: t(lang, 'ai_model_lite_who') || '👤 For: Free accounts (recommended)\n⭐ Best for daily limits, fast replies'
        },
        'gemini-2.5-flash': {
            features: t(lang, 'ai_model_flash_detail') || '✅ Chat, Image generation, Text-to-Speech\n✅ Only model with image & audio gen\n⚠️ No thinking mode',
            target: t(lang, 'ai_model_flash_who') || '👤 For: All Google accounts\n🎨 Best for creative tasks'
        },
        'gemini-2.5-flash-live': {
            features: t(lang, 'ai_model_live_detail') || '⚠️ Voice & Function calling ONLY\n❌ Cannot generate text chat\n❌ No image generation',
            target: t(lang, 'ai_model_live_who') || '👤 For: Developers, Live API\n⚠️ Not for regular chat usage'
        }
    };

    const detail = modelDetails[currentModelFamily] || modelDetails['gemini-3.1-flash-lite'];

    const lines = [
        `🧠 <b>${t(lang, 'ai_model_selection_title')}</b>`,
        '',
        `<b>${t(lang, 'ai_model_current', { model: config.label })}</b>`,
        '',
        detail.features,
        '',
        detail.target
    ];

    if (config.supportsThinking && currentThinkingLevel) {
        const levelLabel = currentThinkingLevel === 'high'
            ? t(lang, 'ai_thinking_level_high')
            : t(lang, 'ai_thinking_level_low');
        lines.push('');
        lines.push(`🔥 ${t(lang, 'ai_thinking_level_current', { level: levelLabel })}`);
    }

    lines.push('');

    // ASCII Table header
    const colModel = t(lang, 'ai_model_col_model') || 'Model';
    const colFeatures = t(lang, 'ai_model_col_features') || 'Công dụng';
    const colTarget = t(lang, 'ai_model_col_target') || 'Đối tượng';

    // Model info for table (matches GEMINI_MODEL_FAMILIES in env.js)
    const modelData = [
        { name: '3.1 Pro', features: t(lang, 'ai_model_3pro_features') || 'Chat,TK,Tools', target: t(lang, 'ai_model_3pro_target') || 'Pro/Ultra' },
        { name: '3 Flash', features: t(lang, 'ai_model_3flash_features') || 'Chat,TK,Tools', target: t(lang, 'ai_model_3flash_target') || 'Tất cả' },
        { name: '3.1 Lite', features: t(lang, 'ai_model_lite_features') || 'Chat,TK,Nhanh', target: t(lang, 'ai_model_lite_target') || 'Tất cả ⭐' },
        { name: '2.5 Flash', features: t(lang, 'ai_model_flash_features') || 'Chat,Ảnh,TTS', target: t(lang, 'ai_model_flash_target') || 'Sáng tạo' },
        { name: '2.5 Live', features: t(lang, 'ai_model_live_features') || 'Voice,Lệnh', target: t(lang, 'ai_model_live_target') || 'Dev' }
    ];

    lines.push('<code>');
    lines.push('╔═════════════╦═════════════╦═════════════╗');
    lines.push(`║${colModel.slice(0, 13).padStart(7).padEnd(13)}║${colFeatures.slice(0, 13).padStart(7).padEnd(13)}║${colTarget.slice(0, 13).padStart(7).padEnd(13)}║`);
    lines.push('╠═════════════╬═════════════╬═════════════╣');
    modelData.forEach((m, i) => {
        lines.push(`║${m.name.slice(0, 13).padStart(7).padEnd(13)}║${m.features.slice(0, 13).padStart(7).padEnd(13)}║${m.target.slice(0, 13).padStart(7).padEnd(13)}║`);
        if (i < modelData.length - 1) {
            lines.push('╠─────────────╬─────────────╬─────────────╣');
        }
    });
    lines.push('╚═════════════╩═════════════╩═════════════╝');
    lines.push('</code>');

    lines.push('');
    lines.push(t(lang, 'ai_model_selection_hint'));
    lines.push('');
    lines.push(t(lang, 'ai_model_usage_note') || '📊 <a href="https://aistudio.google.com/app/usage">Rate Limit</a> → All models');

    return lines.join('\n');
}



// ============ End Gemini Model Selection Functions ============



function advanceGeminiKeyIndex() {

    if (!GEMINI_API_KEYS.length) {

        return 0;

    }

    for (let offset = 1; offset <= GEMINI_API_KEYS.length; offset += 1) {

        const candidate = (aiState.geminiKeyIndex + offset) % GEMINI_API_KEYS.length;

        if (!disabledGeminiKeyIndices.has(candidate)) {

            aiState.geminiKeyIndex = candidate;

            return aiState.geminiKeyIndex;

        }

    }



    return aiState.geminiKeyIndex;

}



function advanceUserGeminiKeyIndex(userId, keyCount) {

    if (!userId || !Number.isInteger(keyCount) || keyCount <= 0) {

        return 0;

    }



    const current = getUserGeminiKeyIndex(userId);

    const next = (current + 1) % keyCount;

    setUserGeminiKeyIndex(userId, next);

    return next;

}



function getGroqClient(index = aiState.groqKeyIndex, keys = GROQ_API_KEYS) {

    if (!Array.isArray(keys) || !keys.length) {

        return null;

    }



    const safeIndex = ((index % keys.length) + keys.length) % keys.length;

    const apiKey = keys[safeIndex];



    return { apiKey, index: safeIndex };

}



function disableGroqKey(index, reason = 'disabled') {

    if (!GROQ_API_KEYS.length) {

        return;

    }



    const safeIndex = ((index % GROQ_API_KEYS.length) + GROQ_API_KEYS.length) % GROQ_API_KEYS.length;

    if (disabledGroqKeyIndices.has(safeIndex)) {

        return;

    }



    disabledGroqKeyIndices.add(safeIndex);

    console.warn(`[AI] Disabled Groq key index ${safeIndex}: ${sanitizeSecrets(reason)}`);



    if (disabledGroqKeyIndices.size >= GROQ_API_KEYS.length) {

        console.error('[AI] All Groq API keys are disabled');

    }

}



function disableUserGroqKey(userId, index, total) {

    if (!userId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {

        return;

    }



    const set = userDisabledGroqKeyIndices.get(userId) || new Set();

    const safeIndex = ((index % total) + total) % total;

    if (set.has(safeIndex)) {

        return;

    }

    set.add(safeIndex);

    userDisabledGroqKeyIndices.set(userId, set);

}



function getUserGroqKeyIndex(userId) {

    const current = Number(userGroqKeyIndices.get(userId));

    return Number.isInteger(current) ? current : 0;

}



function setUserGroqKeyIndex(userId, index) {

    if (!userId || !Number.isInteger(index)) {

        return;

    }

    userGroqKeyIndices.set(userId, index);

}



function advanceGroqKeyIndex() {

    if (!GROQ_API_KEYS.length) {

        return 0;

    }

    for (let offset = 1; offset <= GROQ_API_KEYS.length; offset += 1) {

        const candidate = (aiState.groqKeyIndex + offset) % GROQ_API_KEYS.length;

        if (!disabledGroqKeyIndices.has(candidate)) {

            aiState.groqKeyIndex = candidate;

            return aiState.groqKeyIndex;

        }

    }



    return aiState.groqKeyIndex;

}



function advanceUserGroqKeyIndex(userId, keyCount) {

    if (!userId || !Number.isInteger(keyCount) || keyCount <= 0) {

        return 0;

    }



    const current = getUserGroqKeyIndex(userId);

    const next = (current + 1) % keyCount;

    setUserGroqKeyIndex(userId, next);

    return next;

}



function getOpenAiClient(index = aiState.openAiKeyIndex, keys = OPENAI_API_KEYS) {

    if (!Array.isArray(keys) || !keys.length) {

        return null;

    }



    const safeIndex = ((index % keys.length) + keys.length) % keys.length;

    const apiKey = keys[safeIndex];



    if (!openAiClientPool.has(apiKey)) {

        openAiClientPool.set(apiKey, { apiKey, client: new OpenAI({ apiKey }) });

    }



    return { ...openAiClientPool.get(apiKey), index: safeIndex };

}



function disableOpenAiKey(index, reason = 'disabled') {

    if (!OPENAI_API_KEYS.length) {

        return;

    }



    const safeIndex = ((index % OPENAI_API_KEYS.length) + OPENAI_API_KEYS.length) % OPENAI_API_KEYS.length;

    if (disabledOpenAiKeyIndices.has(safeIndex)) {

        return;

    }



    disabledOpenAiKeyIndices.add(safeIndex);

    console.warn(`[AI] Disabled OpenAI key index ${safeIndex}: ${sanitizeSecrets(reason)}`);



    if (disabledOpenAiKeyIndices.size >= OPENAI_API_KEYS.length) {

        console.error('[AI] All OpenAI API keys are disabled');

    }

}



function disableUserOpenAiKey(userId, index, total) {

    if (!userId || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {

        return;

    }



    const set = userDisabledOpenAiKeyIndices.get(userId) || new Set();

    const safeIndex = ((index % total) + total) % total;

    if (set.has(safeIndex)) {

        return;

    }

    set.add(safeIndex);

    userDisabledOpenAiKeyIndices.set(userId, set);

}



function getUserOpenAiKeyIndex(userId) {

    const current = Number(userOpenAiKeyIndices.get(userId));

    return Number.isInteger(current) ? current : 0;

}



function setUserOpenAiKeyIndex(userId, index) {

    if (!userId || !Number.isInteger(index)) {

        return;

    }

    userOpenAiKeyIndices.set(userId, index);

}



function advanceOpenAiKeyIndex() {

    if (!OPENAI_API_KEYS.length) {

        return 0;

    }

    for (let offset = 1; offset <= OPENAI_API_KEYS.length; offset += 1) {

        const candidate = (aiState.openAiKeyIndex + offset) % OPENAI_API_KEYS.length;

        if (!disabledOpenAiKeyIndices.has(candidate)) {

            aiState.openAiKeyIndex = candidate;

            return aiState.openAiKeyIndex;

        }

    }



    return aiState.openAiKeyIndex;

}



function advanceUserOpenAiKeyIndex(userId, keyCount) {

    if (!userId || !Number.isInteger(keyCount) || keyCount <= 0) {

        return 0;

    }



    const current = getUserOpenAiKeyIndex(userId);

    const next = (current + 1) % keyCount;

    setUserOpenAiKeyIndex(userId, next);

    return next;

}



function buildAiUsageKeyboard(lang) {
    return {
        inline_keyboard: [
            // Row 1: 3 providers
            [
                { text: `✨ Google`, callback_data: 'apihub|ai|google|0' },
                { text: `⚡ Groq`, callback_data: 'apihub|ai|groq|0' },
                { text: `💬 GPT`, callback_data: 'apihub|ai|openai|0' }
            ],
            // Row 2: API Hub
            [{ text: `🧭 ${t(lang, 'api_hub_open') || 'Trung tâm API'}`, callback_data: 'apihub|home' }],
            // Row 3: Stats
            [{ text: `📊 ${t(lang, 'ai_usage_dashboard_button') || 'Thống kê AI'}`, callback_data: 'ai_usage_dashboard' }],
            // Row 4: Close
            [{ text: `❌ ${t(lang, 'action_close') || 'Đóng'}`, callback_data: 'ui_close' }]
        ]
    };
}



function buildTtsSettingsKeyboard(lang, settings, options = {}) {

    const { voice, language } = settings || {};

    const voiceButtons = GEMINI_TTS_VOICE_OPTIONS.map((voiceOption) => {

        const icon = voiceOption.gender === 'female' ? '👩' : voiceOption.gender === 'male' ? '👨' : '🤖';

        const isActive = voiceOption.name === voice;

        return {

            text: `${isActive ? '✅ ' : ''}${icon} ${voiceOption.name}`,

            callback_data: `ttsvoice|${voiceOption.name}`

        };

    });

    const languageButtons = GEMINI_TTS_LANG_OPTIONS.map((option) => {

        const isActive = option.code === (language || 'auto');

        const label = formatTtsLanguageLabel(option.code, lang);

        return {

            text: `${isActive ? '✅ ' : ''}${label}`,

            callback_data: `ttslang|${option.code}`

        };

    });



    const inline_keyboard = [

        ...chunkInlineButtons(voiceButtons, 3),

        ...chunkInlineButtons(languageButtons, 3)

    ];



    const footer = [];

    if (options.backCallbackData) {

        footer.push({ text: t(lang, 'action_back'), callback_data: options.backCallbackData });

    }

    footer.push({ text: t(lang, 'action_close'), callback_data: options.closeCallbackData || 'ui_close' });

    inline_keyboard.push(footer);



    return { inline_keyboard };

}



function buildTtsSettingsText(lang, settings) {

    const { voice, language } = settings || {};

    const langLabel = formatTtsLanguageLabel(language || 'auto', lang);

    const voiceLabel = formatTtsVoiceLabel(voice);

    return [

        `🎧 ${t(lang, 'ai_tts_panel_title')}`,

        t(lang, 'ai_tts_usage'),

        '',

        `• ${t(lang, 'ai_tts_selected_voice', { voice: voiceLabel })}`,

        `• ${t(lang, 'ai_tts_selected_language', { language: langLabel })}`

    ].join('\n');

}



// Mask helper

function maskApiKey(key) {

    if (!key || key.length < 8) return '****';

    return `${key.slice(0, 4)}...${key.slice(-4)}`;

}



// Hydrate AI model preferences from database on startup

async function hydrateAiModelPreferences() {

    if (!db || !db.listAllAiModelPreferences) {

        console.log('[AiService] Database not available for hydration');

        return { loaded: 0 };

    }



    try {

        const rows = await db.listAllAiModelPreferences();

        let loaded = 0;

        for (const row of rows) {

            if (row.userId && (row.modelFamily || row.thinkingLevel || row.preferredKeyIndex)) {

                const prefs = {

                    modelFamily: row.modelFamily || GEMINI_DEFAULT_MODEL_FAMILY,

                    thinkingLevel: row.thinkingLevel || null

                };

                userGeminiModelPreferences.set(row.userId, prefs);



                // Also restore key indices if stored

                if (typeof row.preferredKeyIndex === 'number') {

                    userGeminiKeyIndices.set(row.userId, row.preferredKeyIndex);

                }

                loaded++;

            }

        }

        console.log(`[AiService] Hydrated ${loaded} user AI model preferences from database`);

        return { loaded };

    } catch (error) {

        console.error('[AiService] Failed to hydrate AI model preferences:', error.message);

        return { loaded: 0, error: error.message };

    }

}



module.exports = {

    aiState,

    normalizeAiProvider,

    buildAiProviderMeta,

    extractGoogleCandidateText,

    probeGoogleApiKey,

    probeGroqApiKey,

    isUserApiKeyValid,

    rememberAiApiMenuState,

    getAiApiMenuState,

    buildAiApiMenu,

    parseAiApiSubmission,

    urlToGenerativePart,

    bufferToGenerativePart,

    detectImageAction,

    isQuotaOrRateLimitError,

    isOpenAiBillingError,

    isGeminiApiKeyExpired,

    downloadTelegramPhotoBuffer,

    convertImageToPngSquare,

    buildGroqMessageContent,

    getGeminiClient,

    disableGeminiKey,

    disableUserGeminiKey,

    getUserGeminiKeyIndex,

    setUserGeminiKeyIndex,

    getGeminiTtsVoiceMeta,

    getGeminiTtsLanguageMeta,

    formatTtsVoiceLabel,

    formatTtsLanguageLabel,

    getUserTtsConfig,

    saveUserTtsVoice,

    saveUserTtsLanguage,

    advanceGeminiKeyIndex,

    advanceUserGeminiKeyIndex,

    getGroqClient,

    disableGroqKey,

    disableUserGroqKey,

    getUserGroqKeyIndex,

    setUserGroqKeyIndex,

    advanceGroqKeyIndex,

    advanceUserGroqKeyIndex,

    getOpenAiClient,

    disableOpenAiKey,

    disableUserOpenAiKey,

    getUserOpenAiKeyIndex,

    setUserOpenAiKeyIndex,

    advanceOpenAiKeyIndex,

    advanceUserOpenAiKeyIndex,

    buildAiUsageKeyboard,

    buildTtsSettingsKeyboard,

    buildTtsSettingsText,

    getGeminiModelConfig,

    getUserGeminiModelConfig,

    saveUserGeminiModel,

    saveUserThinkingLevel,

    buildGeminiModelSelectionKeyboard,

    buildGeminiModelSelectionText,

    setDatabase,

    hydrateAiModelPreferences,

    classifyImageIntentWithAI,

    getAndClearExpiredKeyNotices,

    hasExpiredKeyNotices

};



