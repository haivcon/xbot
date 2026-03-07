const { t } = require('../core/i18n');

/**
 * Tạo bàn phím chỉ chứa nút Đóng (hoặc nút Quay lại + Đóng)
 * @param {string} lang - Ngôn ngữ hiện tại
 * @param {object} options - Tùy chọn { backCallbackData, closeCallbackData }
 * @returns {object} Inline keyboard markup
 */
function buildCloseKeyboard(lang, { backCallbackData = null, closeCallbackData = 'ui_close' } = {}) {
    const closeRow = [];
    
    // Nút Quay lại (nếu có)
    if (backCallbackData) {
        closeRow.push({ 
            text: `🔙 ${t(lang, 'action_back')}`, // Thêm icon mặc định cho đẹp
            callback_data: backCallbackData 
        });
    }
    
    // Nút Đóng
    closeRow.push({ 
        text: `❌ ${t(lang, 'action_close')}`, // Thêm icon mặc định cho đẹp
        callback_data: closeCallbackData 
    });

    return { inline_keyboard: [closeRow] };
}

/**
 * Thêm hàng nút Đóng vào cuối một bàn phím có sẵn
 * @param {object} replyMarkup - Bàn phím hiện tại (inline_keyboard)
 * @param {string} lang - Ngôn ngữ hiện tại
 * @param {object} options - Tùy chọn { backCallbackData, closeCallbackData }
 * @returns {object} Bàn phím mới đã thêm hàng nút Đóng
 */
function appendCloseButton(replyMarkup, lang, options = {}) {
    // Clone bàn phím cũ để tránh mutation
    const keyboard = replyMarkup?.inline_keyboard ? replyMarkup.inline_keyboard.map((row) => [...row]) : [];
    
    const closeRow = [];
    if (options.backCallbackData) {
        closeRow.push({ 
            text: `🔙 ${t(lang, 'action_back')}`, 
            callback_data: options.backCallbackData 
        });
    }
    
    closeRow.push({ 
        text: `❌ ${t(lang, 'action_close')}`, 
        callback_data: options.closeCallbackData || 'ui_close' 
    });

    keyboard.push(closeRow);
    return { inline_keyboard: keyboard };
}

module.exports = {
    appendCloseButton,
    buildCloseKeyboard
};