function detectImageAction(promptText, hasPhoto = false) {
    const normalized = (promptText || '').toLowerCase();

    const createKeywords = [
        // English
        'create image', 'generate image', 'draw', 'paint', 'make image', 'imagine',
        // Vietnamese
        'tạo ảnh', 'vẽ ảnh', 'tạo hình', 'ảnh mới', 'hình mới',
        // Chinese (Simplified/Traditional)
        '生成图片', '生成圖像', '画图', '畫圖', '绘制图片', '繪製圖片', '新图片', '新圖片',
        // Russian
        'создать изображение', 'сгенерировать изображение', 'нарисуй', 'сделай картинку',
        // Korean
        '이미지 생성', '사진 만들어줘', '그림 그려줘', '이미지 만들어',
        // Indonesian
        'buat gambar', 'hasilkan gambar', 'gambar baru', 'lukis gambar', 'bikin gambar'
    ];

    const editKeywords = [
        // English
        'edit image', 'edit photo', 'remove background',
        // Vietnamese
        'chỉnh sửa ảnh', 'sửa ảnh', 'thay đổi ảnh',
        // Chinese
        '编辑图片', '編輯圖片', '修改圖片', '修改照片', '去掉背景', '移除背景',
        // Russian
        'редактировать изображение', 'редактировать фото', 'измени фон',
        // Korean
        '이미지 편집', '사진 편집', '배경 제거',
        // Indonesian
        'edit gambar', 'edit foto', 'hapus latar'
    ];

    const variationKeywords = [
        // English
        'variation', 'new version', 'another version',
        // Vietnamese
        'biến thể', 'phiên bản khác', 'phiên bản mới',
        // Chinese
        '变体', '變體', '新版本', '另一版本',
        // Russian
        'вариация', 'другая версия', 'новая версия',
        // Korean
        '변형', '다른 버전', '새 버전',
        // Indonesian
        'variasi', 'versi lain', 'versi baru'
    ];

    if (hasPhoto) {
        if (variationKeywords.some((keyword) => normalized.includes(keyword))) {
            return 'variation';
        }

        if (editKeywords.some((keyword) => normalized.includes(keyword))) {
            return 'edit';
        }
    }

    if (createKeywords.some((keyword) => normalized.includes(keyword))) {
        return 'generate';
    }

    return null;
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

module.exports = {
    detectImageAction,
    isQuotaOrRateLimitError,
    isOpenAiBillingError,
    isGeminiApiKeyExpired
}