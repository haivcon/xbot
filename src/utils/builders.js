const { t } = require('../../i18n');
const { escapeHtml, formatCopyableValueHtml } = require('./format');

function buildCloseKeyboard(lang, { backCallbackData = null, closeCallbackData = 'ui_close' } = {}) {
    const closeRow = [];
    if (backCallbackData) {
        closeRow.push({ text: t(lang, 'action_back'), callback_data: backCallbackData });
    }
    closeRow.push({ text: t(lang, 'action_close'), callback_data: closeCallbackData });

    return { inline_keyboard: [closeRow] };
}

function buildBanNotice(lang, userInfo = {}) {
    const fullName = [userInfo.first_name, userInfo.last_name, userInfo.fullName]
        .filter(Boolean)
        .join(' ') || userInfo.name || t(lang, 'owner_user_unknown');
    const username = userInfo.username ? `@${escapeHtml(userInfo.username)}` : t(lang, 'owner_banned_unknown_username');
    const idLabel = formatCopyableValueHtml(userInfo.id || userInfo.userId || userInfo.chatId) || escapeHtml(userInfo.id || userInfo.userId || userInfo.chatId || '');

    return t(lang, 'owner_banned_notice', {
        fullName: escapeHtml(fullName),
        telegramId: idLabel,
        username,
        contact: 'x.com/haivcon_X'
    });
}


const db = require('../../db.js');
const { shortenAddress, normalizeAddressSafe } = require('./web3');

function appendCloseButton(replyMarkup, lang, options = {}) {
    const keyboard = replyMarkup?.inline_keyboard ? replyMarkup.inline_keyboard.map((row) => [...row]) : [];
    const closeRow = [];
    if (options.backCallbackData) {
        closeRow.push({ text: t(lang, 'action_back'), callback_data: options.backCallbackData });
    }
    closeRow.push({ text: t(lang, 'action_close'), callback_data: options.closeCallbackData || 'ui_close' });

    keyboard.push(closeRow);
    return { inline_keyboard: keyboard };
}

function buildWalletActionKeyboard(lang, portfolioLinks = [], options = {}) {
    const extraRows = [];
    for (const link of portfolioLinks) {
        if (!link?.url || !link.address) {
            continue;
        }
        extraRows.push([
            {
                text: t(lang, 'wallet_action_portfolio', { wallet: shortenAddress(link.address) }),
                url: link.url
            }
        ]);
    }

    const inline_keyboard = [
        [{ text: t(lang, 'wallet_action_view'), callback_data: 'wallet_overview' }],
        [{ text: t(lang, 'wallet_action_manage'), callback_data: 'wallet_manage' }],
        [{ text: t(lang, 'tw_title'), callback_data: 'tw_back' }],
        ...extraRows
    ];

    if (options.includeClose !== false) {
        inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);
    }

    return { inline_keyboard };
}

async function buildWalletSelectMenu(lang, chatId, walletsOverride = null) {
    const wallets = Array.isArray(walletsOverride) ? walletsOverride : await db.getWalletsForUser(chatId);
    if (!Array.isArray(wallets) || wallets.length === 0) {
        return {
            text: t(lang, 'mywallet_not_linked'),
            replyMarkup: appendCloseButton(null, lang)
        };
    }

    const lines = [
        t(lang, 'mywallet_list_header', { count: wallets.length.toString() }),
        t(lang, 'mywallet_list_footer')
    ];

    const inline_keyboard = [];
    for (const wallet of wallets) {
        const normalized = normalizeAddressSafe(wallet?.address || wallet) || wallet?.address || wallet;
        const shortAddr = shortenAddress(normalized);
        const nameLabel = typeof wallet?.name === 'string' && wallet.name.trim() ? `${wallet.name.trim()} • ` : '';
        inline_keyboard.push([{ text: `💼 ${nameLabel}${shortAddr}`, callback_data: `wallet_pick|${normalized}` }]);
    }
    inline_keyboard.push([{ text: t(lang, 'action_close'), callback_data: 'ui_close' }]);

    return {
        text: lines.join('\n'),
        replyMarkup: { inline_keyboard }
    };
}

const { DEVELOPER_DONATION_ADDRESS } = require('../config');

function buildDonateMessage(lang, { variant = 'community', groupSettings = null } = {}) {
    const lines = [];
    lines.push(`❤️ <b>${escapeHtml(t(lang, 'donate_title'))}</b>`);
    lines.push(`<i>${escapeHtml(t(lang, 'donate_description'))}</i>`);

    lines.push('');
    lines.push(`🚀 <i>${escapeHtml(t(lang, 'donate_support_cta'))}</i>`);
    lines.push('');
    const label = t(lang, 'donate_developer_wallet_label');
    lines.push(`💻 <b>${escapeHtml(label)}</b>`);
    lines.push(`<code>${escapeHtml(DEVELOPER_DONATION_ADDRESS)}</code>`);
    lines.push(`🧠 <i>${escapeHtml(t(lang, 'donate_developer_wallet_desc'))}</i>`);
    lines.push(`⚠️ <i>${escapeHtml(t(lang, 'donate_developer_wallet_warning'))}</i>`);
    lines.push('', `🙏 <i>${escapeHtml(t(lang, 'donate_footer'))}</i>`);
    return lines.filter(Boolean).join('\n');
}

function buildDonateKeyboard(lang) {
    const inline_keyboard = [[{ text: t(lang, 'help_button_close'), callback_data: 'donate_cmd|close' }]];

    return { inline_keyboard };
}

module.exports = {
    buildCloseKeyboard,
    buildBanNotice,
    appendCloseButton,
    buildWalletActionKeyboard,
    buildWalletSelectMenu,
    buildDonateMessage,
    buildDonateKeyboard
}