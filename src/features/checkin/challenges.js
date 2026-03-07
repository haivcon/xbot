const { v4: uuidv4 } = require('uuid');

function createCheckinChallenges({
    t,
    pickQuestionType,
    CHECKIN_EMOTIONS,
    CHECKIN_GOAL_PRESETS,
    SCIENCE_TEMPLATES,
    SCIENCE_ENTRIES
}) {
    const SCIENCE_LANGUAGE_SET = new Set(
        Object.values(SCIENCE_TEMPLATES).flatMap((template) => Object.keys(template || {}))
    );
    const SCIENCE_CATEGORY_KEYS = Object.keys(SCIENCE_TEMPLATES || {});

    function resolveScienceLang(lang = 'en') {
        if (!lang) {
            return 'en';
        }
        const normalized = lang.toLowerCase();
        if (SCIENCE_LANGUAGE_SET.has(normalized)) {
            return normalized;
        }
        const short = normalized.split('-')[0];
        if (SCIENCE_LANGUAGE_SET.has(short)) {
            return short;
        }
        return 'en';
    }

    function getScienceEntriesByType(category) {
        const pool = SCIENCE_ENTRIES[category];
        return Array.isArray(pool) ? pool : [];
    }

    function getScienceTemplate(category, lang) {
        const templates = SCIENCE_TEMPLATES[category] || {};
        return templates[lang] || templates.en || 'Which formula applies to {concept}?';
    }

    function renderScienceQuestion(category, entry, lang) {
        const template = getScienceTemplate(category, lang);
        const conceptText = entry?.concept?.[lang] || entry?.concept?.en || '';
        return template.replace('{concept}', conceptText);
    }

    function shuffleArray(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    function buildScienceOptionTexts(entries, correctFormula) {
        const options = new Set([correctFormula]);
        let guard = 0;
        while (options.size < 4 && guard < entries.length * 4) {
            const candidate = entries[Math.floor(Math.random() * entries.length)]?.formula;
            if (candidate) {
                options.add(candidate);
            }
            guard += 1;
        }
        while (options.size < 4) {
            options.add(`${(Math.random() * 10).toFixed(2)}`);
        }
        return shuffleArray(Array.from(options));
    }

    function generateMathChallenge(lang = 'en') {
        const resolvedLang = lang || 'en';
        const operations = ['+', '-', 'x', '÷'];
        const op = operations[Math.floor(Math.random() * operations.length)];
        let a = Math.floor(Math.random() * 12) + 1;
        let b = Math.floor(Math.random() * 12) + 1;
        let expression = '';
        let answer = 0;

        switch (op) {
            case '+':
                answer = a + b;
                expression = `${a} + ${b}`;
                break;
            case '-':
                if (b > a) {
                    [a, b] = [b, a];
                }
                answer = a - b;
                expression = `${a} - ${b}`;
                break;
            case 'x':
                answer = a * b;
                expression = `${a} x ${b}`;
                break;
            case '÷':
                answer = a;
                expression = `${a * b} ÷ ${b}`;
                break;
            default:
                answer = a + b;
                expression = `${a} + ${b}`;
                break;
        }

        const options = new Set([answer]);
        while (options.size < 4) {
            const delta = Math.floor(Math.random() * 10) + 1;
            const sign = Math.random() > 0.5 ? 1 : -1;
            const candidate = answer + sign * delta;
            if (candidate >= 0) {
                options.add(candidate);
            }
        }

        const optionArray = shuffleArray(Array.from(options));
        const correctIndex = optionArray.findIndex((value) => value === answer);
        const questionText = t(resolvedLang, 'checkin_math_question', { expression });

        return {
            type: 'math',
            question: questionText,
            options: optionArray.map((value, index) => ({
                text: value.toString(),
                isCorrect: index === correctIndex,
                index
            })),
            correctIndex
        };
    }

    function generateScienceChallenge(category = 'physics', lang = 'en') {
        const entries = getScienceEntriesByType(category);
        if (!entries.length) {
            return generateMathChallenge(lang);
        }
        const resolvedLang = resolveScienceLang(lang);
        const entry = entries[Math.floor(Math.random() * entries.length)];
        const questionText = renderScienceQuestion(category, entry, resolvedLang);
        const optionTexts = buildScienceOptionTexts(entries, entry.formula);
        const options = optionTexts.map((text, index) => ({
            text,
            isCorrect: text === entry.formula,
            index
        }));
        const correctIndex = options.findIndex((option) => option.isCorrect);

        return {
            type: category,
            question: questionText,
            options,
            correctIndex: correctIndex >= 0 ? correctIndex : 0
        };
    }

    function generateCheckinChallenge(lang = 'en', questionType = null, settings = null) {
        const resolvedType = questionType || pickQuestionType(settings);
        if (resolvedType !== 'math' && SCIENCE_CATEGORY_KEYS.includes(resolvedType)) {
            return generateScienceChallenge(resolvedType, lang);
        }
        return generateMathChallenge(lang);
    }

    function buildEmotionKeyboard(lang, token) {
        const rows = [];
        for (let i = 0; i < CHECKIN_EMOTIONS.length; i += 3) {
            const row = [];
            for (let j = i; j < i + 3 && j < CHECKIN_EMOTIONS.length; j++) {
                const emoji = CHECKIN_EMOTIONS[j];
                row.push({ text: emoji, callback_data: `checkin_emotion|${token}|${encodeURIComponent(emoji)}` });
            }
            rows.push(row);
        }
        rows.push([{ text: t(lang, 'checkin_button_skip'), callback_data: `checkin_emotion_skip|${token}` }]);
        return { inline_keyboard: rows };
    }

    function buildGoalKeyboard(lang, token) {
        const rows = [];
        for (const preset of CHECKIN_GOAL_PRESETS) {
            const text = t(lang, preset);
            rows.push([{ text, callback_data: `checkin_goal_choose|${token}|${encodeURIComponent(text)}` }]);
        }
        rows.push([
            { text: t(lang, 'checkin_goal_button_custom'), callback_data: `checkin_goal_custom|${token}` },
            { text: t(lang, 'checkin_goal_button_later'), callback_data: `checkin_goal_skip|${token}` }
        ]);
        return { inline_keyboard: rows };
    }

    function sanitizeGoalInput(text) {
        if (typeof text !== 'string') {
            return null;
        }

        const trimmed = text.trim();
        if (!trimmed) {
            return null;
        }

        if (trimmed.length > 200) {
            return trimmed.slice(0, 200);
        }

        return trimmed;
    }

    function createShortToken(prefix = 'chk') {
        const raw = uuidv4().replace(/-/g, '');
        const short = raw.slice(0, 16);
        return `${prefix}_${short}`;
    }

    return {
        resolveScienceLang,
        getScienceEntriesByType,
        getScienceTemplate,
        renderScienceQuestion,
        buildScienceOptionTexts,
        shuffleArray,
        generateMathChallenge,
        generateScienceChallenge,
        generateCheckinChallenge,
        buildEmotionKeyboard,
        buildGoalKeyboard,
        sanitizeGoalInput,
        createShortToken,
        SCIENCE_CATEGORY_KEYS
    };
}

module.exports = createCheckinChallenges;