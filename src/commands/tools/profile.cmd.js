/**
 * Profile Command - Save basic identity info (name/age/gender) for personalized AI replies
 * File: src/commands/tools/profile.cmd.js
 */

const { resolveLangCode } = require('../../core/i18n');
const { defaultLang } = require('../../config/env');
const { getLang } = require('../../app/language');

module.exports = (deps) => {
    const { sendReply, t, db, buildCloseKeyboard } = deps;

    function normalizeBirthdate(rawDate) {
        if (!rawDate) return null;
        const clean = rawDate.trim();
        // yyyy-mm-dd or yyyy/mm/dd
        let m = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (m) {
            const [_, y, mo, d] = m;
            return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        // dd-mm-yyyy or dd/mm/yyyy
        m = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
        if (m) {
            const [_, d, mo, yRaw] = m;
            const y = yRaw.length === 2 ? `20${yRaw}` : yRaw.padStart(4, '0');
            return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return clean.slice(0, 32); // keep user-provided string as-is (short)
    }

    function parseProfileInput(raw) {
        if (!raw) return null;
        const text = raw.trim();
        let name = null;
        let age = null;
        let gender = null;
        let birthdate = null;
        let nationality = null;

        // key=value style
        const nameMatch = text.match(/name\s*[:=]\s*([^\n|,]+)/i);
        const ageMatch = text.match(/age\s*[:=]\s*(\d{1,3})/i);
        const genderMatch = text.match(/gender\s*[:=]\s*([^\s|,]+)/i);
        const birthMatch = text.match(/(dob|birth(day)?|birthdate)\s*[:=]\s*([^\n|,]+)/i);
        const nationMatch = text.match(/(nation(alit[y|i])?|country)\s*[:=]\s*([^\n|,]+)/i);
        if (nameMatch) name = nameMatch[1].trim();
        if (ageMatch) age = Number(ageMatch[1]);
        if (genderMatch) gender = genderMatch[1].trim();
        if (birthMatch) birthdate = normalizeBirthdate(birthMatch[3]);
        if (nationMatch) nationality = nationMatch[3].trim();

        // pipe/comma separated fallback: Name | Age | Gender
        if (!name || !gender) {
            const parts = text.split(/[\|,]/).map((p) => p.trim()).filter(Boolean);
            if (parts.length >= 1 && !name) name = parts[0];
            if (parts.length >= 2 && !age) {
                const num = Number(parts[1]);
                if (Number.isFinite(num)) age = num;
            }
            if (parts.length >= 3 && !gender) gender = parts[2];
            if (parts.length >= 4 && !birthdate) birthdate = normalizeBirthdate(parts[3]);
            if (parts.length >= 5 && !nationality) nationality = parts[4];
        }

        // normalize gender - support multiple languages
        if (gender) {
            const g = gender.toLowerCase();
            // Male: English, Vietnamese, Chinese, Korean, Russian, Indonesian
            if (/^(male|man|boy|m|anh|nam|男|남|남자|мужской|муж|мужчина|pria|laki-laki|laki)$/i.test(g)) {
                gender = 'male';
            }
            // Female: English, Vietnamese, Chinese, Korean, Russian, Indonesian
            else if (/^(female|woman|girl|f|chi|nu|nữ|女|여|여자|женский|жен|женщина|wanita|perempuan)$/i.test(g)) {
                gender = 'female';
            }
            else {
                gender = 'other';
            }
        }

        if (!name || !gender) return null;
        return { name, age: age || null, gender, birthdate: birthdate || null, nationality: nationality || null };
    }

    function sanitizeForTable(value) {
        const safe = (value === null || value === undefined || value === '') ? '-' : String(value);
        return safe.replace(/`/g, "'").replace(/\s+/g, ' ').slice(0, 128);
    }

    // Translate gender to user's language
    function translateGender(gender, lang) {
        if (!gender) return '-';
        const genderLabels = {
            male: { en: 'Male', vi: 'Nam', zh: '男', ko: '남자', ru: 'Мужской', id: 'Pria' },
            female: { en: 'Female', vi: 'Nữ', zh: '女', ko: '여자', ru: 'Женский', id: 'Wanita' },
            other: { en: 'Other', vi: 'Khác', zh: '其他', ko: '기타', ru: 'Другое', id: 'Lainnya' }
        };
        const labels = genderLabels[gender] || genderLabels.other;
        return labels[lang] || labels.en;
    }

    function formatIdentityTable(identity, lang, t) {
        if (!identity) return '';

        const rows = [
            [t(lang, 'profile_table_name') || 'Name', sanitizeForTable(identity.name)],
            [t(lang, 'profile_table_age') || 'Age', sanitizeForTable(identity.age ?? '-')],
            [t(lang, 'profile_table_gender') || 'Gender', sanitizeForTable(translateGender(identity.gender, lang))],
            [t(lang, 'profile_table_birthdate') || 'Birthdate', sanitizeForTable(identity.birthdate)],
            [t(lang, 'profile_table_nationality') || 'Nationality', sanitizeForTable(identity.nationality)]
        ];

        const col1Width = Math.max(...rows.map(([label]) => label.length));
        const col2Width = Math.max(...rows.map(([, value]) => value.length));

        const top = `╔${'═'.repeat(col1Width + 2)}╦${'═'.repeat(col2Width + 2)}╗`;
        const mid = `╠${'═'.repeat(col1Width + 2)}╬${'═'.repeat(col2Width + 2)}╣`;
        const bottom = `╚${'═'.repeat(col1Width + 2)}╩${'═'.repeat(col2Width + 2)}╝`;

        const body = rows.map(([label, value]) => {
            const paddedLabel = label.padEnd(col1Width, ' ');
            const paddedValue = value.padEnd(col2Width, ' ');
            return `║ ${paddedLabel} ║ ${paddedValue} ║`;
        }).join(`\n${mid}\n`);

        return `${top}\n${body}\n${bottom}`;
    }

    return {
        name: 'profile',
        aliases: ['whoami'],
        category: 'tools',
        permissions: ['user'],
        cooldown: 2000,
        usage: '/profile Name | Age | Gender | Birthdate | Nationality',
        descKey: 'help_command_profile',
        hidden: false,

        handler: async (msg, { lang, argsText }) => {
            const userId = msg.from?.id?.toString();
            const chatId = msg.chat?.id?.toString();
            const rawInput = (argsText || '').trim();

            // Resolve language via central getLang to mirror /lang selection
            let effectiveLang = null;
            try {
                effectiveLang = await getLang(msg);
            } catch (_) {
                // fallback chain
                effectiveLang = lang ? resolveLangCode(lang) : null;
                if (!effectiveLang && chatId && db?.getUserLanguageInfo) {
                    const info = await db.getUserLanguageInfo(chatId);
                    if (info?.lang) effectiveLang = resolveLangCode(info.lang);
                }
                if (!effectiveLang) {
                    effectiveLang = resolveLangCode(msg?.from?.language_code);
                }
                if (!effectiveLang) {
                    effectiveLang = defaultLang;
                }
            }

            if (!rawInput) {
                const memory = (userId && await db.getAiMemory(userId)) || {};
                const identity = memory?.userPreferences?.identity;
                const table = formatIdentityTable(identity, effectiveLang, t);
                const prompt = t(effectiveLang, 'profile_prompt');
                const tableTitle = t(effectiveLang, 'profile_table_title') || '📋 Your Profile';
                const message = identity && table
                    ? `${tableTitle}\n<pre>${table}</pre>\n\n${prompt}`
                    : prompt;
                await sendReply(msg, message, { parse_mode: 'HTML', reply_markup: buildCloseKeyboard ? buildCloseKeyboard(effectiveLang) : undefined });
                return;
            }

            // Clear identity
            if (/^(clear|reset|delete)$/i.test(rawInput)) {
                const memory = (userId && await db.getAiMemory(userId)) || {};
                const userPreferences = memory.userPreferences || {};
                delete userPreferences.identity;
                if (userId) {
                    await db.updateAiMemory(userId, { userPreferences, userName: null });
                }
                await sendReply(msg, t(effectiveLang, 'profile_cleared') || '🗑️ Personal info cleared.', { parse_mode: 'HTML', reply_markup: buildCloseKeyboard ? buildCloseKeyboard(effectiveLang) : undefined });
                return;
            }

            const parsed = parseProfileInput(rawInput);
            if (!parsed) {
                await sendReply(msg, t(effectiveLang, 'profile_invalid') || '❌ Could not parse profile. Use: Name | Age | Gender | Birthdate | Nationality.', { parse_mode: 'HTML', reply_markup: buildCloseKeyboard ? buildCloseKeyboard(effectiveLang) : undefined });
                return;
            }

            const memory = (userId && await db.getAiMemory(userId)) || {};
            const userPreferences = memory.userPreferences || {};
            userPreferences.identity = {
                name: parsed.name,
                age: parsed.age,
                gender: parsed.gender,
                birthdate: parsed.birthdate,
                nationality: parsed.nationality
            };

            if (userId) {
                await db.updateAiMemory(userId, { userName: parsed.name, userPreferences });
            }

            await sendReply(
                msg,
                t(effectiveLang, 'profile_saved', {
                    name: parsed.name,
                    age: parsed.age || '-',
                    gender: parsed.gender,
                    birthdate: parsed.birthdate || '-',
                    nationality: parsed.nationality || '-'
                }) || `✅ Profile saved: ${parsed.name} | ${parsed.age || '-'} | ${parsed.gender} | ${parsed.birthdate || '-'} | ${parsed.nationality || '-'}`,
                { parse_mode: 'HTML', reply_markup: buildCloseKeyboard ? buildCloseKeyboard(effectiveLang) : undefined }
            );
        }
    };
};
