const fs = require('fs');
const fmtPath = 'src/features/ai/onchain/formatters.js';
const viPath = 'locales/vi.json';
const enPath = 'locales/en.json';

const fmt = fs.readFileSync(fmtPath, 'utf8');
const keys = [...fmt.matchAll(/t\(lang,\s*'([^']+)'\)/g)].map(m => m[1]);
const uniqueKeys = [...new Set(keys)].filter(k => k.startsWith('ai_') || k.startsWith('wallet_'));

const viDict = {};
const enDict = {};

uniqueKeys.forEach(k => {
    const readable = k.replace(/^ai_/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    viDict[k] = '[AI] ' + readable;
    enDict[k] = '[AI] ' + readable;
});

const viSpecifics = {
    'ai_search_header': '🔍 Kết quả Tìm Kiếm Token',
    'ai_search_chain': 'Chuỗi (Chain)',
    'ai_search_price': 'Giá HT',
    'ai_search_ca': 'Hợp đồng (CA)',
    'ai_search_liq': 'Thanh Khoản',
    'ai_search_fdv': 'FDV',
    'ai_search_warn_unverified': '⚠️ Token chưa được xác minh',
    'ai_search_sym': 'Ký hiệu',
    'ai_search_name': 'Tên',
    'ai_quote_header': '💱 BÁO GIÁ SWAP',
    'ai_quote_route': 'Lộ trình',
    'ai_quote_price': 'Giá',
    'ai_quote_impact': 'Trượt giá (Price Impact)',
    'ai_quote_gas': 'Phí Gas (ước tính)',
    'ai_quote_fee': 'Phí Giao dịch',
    'ai_quote_confirm': '⚡ Xác nhận swap? Trả lời "ok" hoặc "có" để tiếp tục.',
    'ai_wallet_error': '❌ Lỗi kiểm tra ví',
    'ai_wallet_empty': '📭 Ví rỗng (0 token).',
    'ai_wallet_header': 'Chi tiết tài sản ví:',
    'ai_wallet_time': 'Thời gian',
    'ai_wallet_wallet': 'Ví',
    'ai_wallet_chain': 'Mạng lưới',
    'ai_wallet_total_usd': 'Tổng giá trị (USD)',
    'ai_wallet_balance_label': 'Số dư',
    'ai_wallet_price_label': 'Giá',
    'ai_wallet_value_label': 'Trị giá',
    'ai_wallet_risk_warn': 'Cảnh báo rủi ro',
    'ai_wallet_safe': 'An toàn',
    'ai_top_header': '📈 Top Token Nổi Bật',
    'ai_top_mc_label': 'Vốn hóa',
    'ai_top_vol_label': 'Khối lượng 24h',
    'ai_top_liq_label': 'Thanh khoản',
    'ai_detail_ca': 'Hợp đồng',
    'ai_detail_price': 'Giá hiện tại',
    'ai_detail_change': 'Thay đổi 24h',
    'ai_sim_failed': '❌ Mô phỏng Thất bại',
    'ai_sim_success': '✅ Mô phỏng Thành công',
    'ai_sec_error': 'Lỗi kiểm tra bảo mật',
    'ai_sec_honey_detected': '🚨 Phát hiện Honeypot',
    'ai_sec_safe_temp': '✅ An toàn tạm thời',
};

Object.assign(viDict, viSpecifics);

function injectDict(filePath, dict) {
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let added = 0;
        for (let k of Object.keys(dict)) {
            if (!content[k]) {
                content[k] = dict[k];
                added++;
            }
        }
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`Added ${added} keys to ${filePath}`);
    } catch (e) {
        console.error(`Update failed for ${filePath}:`, e.message);
    }
}

injectDict(viPath, viDict);
injectDict(enPath, enDict);
