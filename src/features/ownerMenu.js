function createOwnerMenuFeature({
    t,
    escapeHtml,
    formatCommandLabel,
    buildCloseKeyboard,
    OWNER_MENU_ACTIONS,
    OWNER_MENU_GROUPS
}) {
    function getDefaultOwnerGroup() {
        return OWNER_MENU_GROUPS[0]?.key || 'ops';
    }

    // Helper: Chunk array into rows of N items
    function chunkArray(array, chunkSize) {
        const results = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            results.push(array.slice(i, i + chunkSize));
        }
        return results;
    }

    function buildOwnerMenuText(lang, activeGroup = getDefaultOwnerGroup()) {
        const group = OWNER_MENU_GROUPS.find((entry) => entry.key === activeGroup) || OWNER_MENU_GROUPS[0];

        if (!group) {
            return '';
        }

        const rows = [];
        (group.actions || []).forEach((actionKey) => {
            const action = OWNER_MENU_ACTIONS[actionKey];
            if (!action) {
                return;
            }
            const labelText = t(lang, action.labelKey);
            // Thêm context để format đẹp hơn nếu hàm format hỗ trợ
            const commandLabel = formatCommandLabel(labelText, { icon: action.icon, context: 'menu_item' });
            const desc = t(lang, action.descKey);
            
            // Format: 🔹 [Command]
            //           Description
            rows.push(`🔹 ${commandLabel}\n   <i>${escapeHtml(desc)}</i>`);
        });

        const lines = [
            `<b>🛠 ${t(lang, 'owner_menu_title')}</b>`, // Header đậm và thêm icon
            `<i>${escapeHtml(t(lang, 'owner_menu_hint'))}</i>`,
            '' // Dòng trống ngăn cách
        ];

        if (rows.length) {
            lines.push(
                `${group.icon} <b>${escapeHtml(t(lang, group.titleKey))}</b>`,
                `<i>${escapeHtml(t(lang, group.descKey))}</i>`,
                '━━━━━━━━━━━━━━━━', // Separator line thay vì gọi formatCommandLabel trống dễ gây lỗi
                rows.join('\n\n') // Tăng khoảng cách giữa các mục để dễ đọc
            );
        }

        return lines.filter((line) => line !== null && line !== undefined).join('\n');
    }

    function buildOwnerMenuKeyboard(lang, activeGroup = getDefaultOwnerGroup()) {
        const inline_keyboard = [];

        // 1. Navigation Buttons (Tabs)
        const navButtons = OWNER_MENU_GROUPS.map((group) => {
            const isActive = group.key === activeGroup;
            // Thêm dấu tick ✅ nếu group đang active
            const icon = isActive ? '✅' : (group.icon || '📁'); 
            return {
                text: `${icon} ${t(lang, group.titleKey)}`,
                callback_data: `owner_menu|group|${group.key}`
            };
        });

        // Chia tab thành 2 cột
        inline_keyboard.push(...chunkArray(navButtons, 2));

        // 2. Action Buttons (Commands)
        const active = OWNER_MENU_GROUPS.find((group) => group.key === activeGroup) || OWNER_MENU_GROUPS[0];
        const actionButtons = [];

        (active?.actions || []).forEach((actionKey) => {
            const action = OWNER_MENU_ACTIONS[actionKey];
            if (!action) return;

            const label = `${action.icon || '⚙️'} ${t(lang, action.labelKey)}`;
            actionButtons.push({ text: label, callback_data: action.callback });
        });

        // Chia action thành 2 cột (dễ đọc hơn 3 cột trên mobile)
        if (actionButtons.length) {
            inline_keyboard.push(...chunkArray(actionButtons, 2));
        }

        // 3. Close Button
        inline_keyboard.push([{ 
            text: `❌ ${t(lang, 'help_button_close')}`, 
            callback_data: 'owner_menu|close' 
        }]);

        return { inline_keyboard };
    }

    function buildOwnerCommandLimitKeyboard(lang) {
        return {
            inline_keyboard: [
                [
                    { text: `🔒 ${t(lang, 'owner_command_button_limit')}`, callback_data: 'owner_command|limit' },
                    { text: `🔓 ${t(lang, 'owner_command_button_unlimit')}`, callback_data: 'owner_command|unlimit' }
                ],
                [
                    { text: `📊 ${t(lang, 'owner_command_button_stats')}`, callback_data: 'owner_command|stats' }
                ],
                [
                    { text: `🔙 ${t(lang, 'help_button_close')}`, callback_data: 'owner_menu|close' }
                ]
            ]
        };
    }

    function buildOwnerAiCommandLimitKeyboard(lang) {
        return {
            inline_keyboard: [
                [
                    { text: `🔒 ${t(lang, 'owner_menu_ai_limit')}`, callback_data: 'owner_ai_command|limit' },
                    { text: `🔓 ${t(lang, 'owner_menu_ai_unlimit')}`, callback_data: 'owner_ai_command|unlimit' }
                ],
                [
                    { text: `📊 ${t(lang, 'owner_menu_ai_stats')}`, callback_data: 'owner_ai_command|stats' }
                ],
                [
                    { text: `🔙 ${t(lang, 'help_button_close')}`, callback_data: 'owner_menu|close' }
                ]
            ]
        };
    }

    return {
        getDefaultOwnerGroup,
        buildOwnerMenuText,
        buildOwnerMenuKeyboard,
        buildOwnerCommandLimitKeyboard,
        buildOwnerAiCommandLimitKeyboard
    };
}

module.exports = createOwnerMenuFeature;