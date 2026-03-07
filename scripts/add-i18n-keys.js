const fs = require('fs');
const path = require('path');

const newKeys = {
    portfolio_no_wallet: { en: '🔗 No linked wallet found. Use /register to add one, or use /portfolio <address>.', vi: '🔗 Chưa liên kết ví. Dùng /register để thêm, hoặc /portfolio <address>.', zh: '🔗 未找到关联钱包。使用 /register 添加。', ko: '🔗 연결된 지갑이 없습니다. /register로 추가하세요.', ru: '🔗 Кошелек не найден. Используйте /register.', id: '🔗 Wallet belum terhubung. Gunakan /register.' },
    portfolio_loading: { en: '⏳ Loading portfolio...', vi: '⏳ Đang tải danh mục...', zh: '⏳ 加载投资组合...', ko: '⏳ 포트폴리오 로딩...', ru: '⏳ Загрузка портфеля...', id: '⏳ Memuat portofolio...' },
    portfolio_title: { en: 'Portfolio Overview', vi: 'Tổng quan danh mục', zh: '投资组合概览', ko: '포트폴리오 개요', ru: 'Обзор портфеля', id: 'Ikhtisar Portofolio' },
    portfolio_address: { en: 'Address', vi: 'Địa chỉ', zh: '地址', ko: '주소', ru: 'Адрес', id: 'Alamat' },
    portfolio_total_value: { en: 'Total Value', vi: 'Tổng giá trị', zh: '总价值', ko: '총 가치', ru: 'Общая стоимость', id: 'Total Nilai' },
    portfolio_holdings: { en: 'Token Holdings', vi: 'Token đang giữ', zh: '持有代币', ko: '보유 토큰', ru: 'Токены', id: 'Token Dimiliki' },
    portfolio_more_tokens: { en: '+{count} more tokens', vi: '+{count} token khác', zh: '+{count} 个额外代币', ko: '+{count}개 추가 토큰', ru: '+{count} других токенов', id: '+{count} token lainnya' },
    portfolio_no_tokens: { en: 'No tokens found on this chain.', vi: 'Không tìm thấy token trên chain này.', zh: '此链上未找到代币。', ko: '이 체인에서 토큰을 찾을 수 없습니다.', ru: 'Токены не найдены.', id: 'Tidak ada token ditemukan.' },
    portfolio_refresh: { en: 'Refresh', vi: 'Làm mới', zh: '刷新', ko: '새로고침', ru: 'Обновить', id: 'Segarkan' },
    portfolio_error: { en: '❌ Failed to load portfolio. Please try again later.', vi: '❌ Không thể tải danh mục. Vui lòng thử lại.', zh: '❌ 加载失败，请稍后重试。', ko: '❌ 포트폴리오 로딩 실패.', ru: '❌ Ошибка загрузки портфеля.', id: '❌ Gagal memuat portofolio.' },
    swap_usage: { en: '🔄 *Swap Usage:*\n`/swap <amount> <fromToken> <toToken>`\nExample: `/swap 10 USDT OKB`', vi: '🔄 *Cách dùng Swap:*\n`/swap <số lượng> <tokenGửi> <tokenNhận>`\nVí dụ: `/swap 10 USDT OKB`', zh: '🔄 *兑换用法:*\n`/swap <数量> <源代币> <目标代币>`\n示例: `/swap 10 USDT OKB`', ko: '🔄 *스왑 사용법:*\n`/swap <수량> <보내는토큰> <받는토큰>`\n예시: `/swap 10 USDT OKB`', ru: '🔄 *Использование Swap:*\n`/swap <сумма> <из> <в>`\nПример: `/swap 10 USDT OKB`', id: '🔄 *Cara Swap:*\n`/swap <jumlah> <dari> <ke>`\nContoh: `/swap 10 USDT OKB`' },
    swap_invalid_amount: { en: '❌ Invalid amount.', vi: '❌ Số lượng không hợp lệ.', zh: '❌ 金额无效。', ko: '❌ 잘못된 금액입니다.', ru: '❌ Неверная сумма.', id: '❌ Jumlah tidak valid.' },
    swap_searching: { en: '🔍 Searching tokens and getting quote...', vi: '🔍 Đang tìm token và lấy báo giá...', zh: '🔍 搜索代币...', ko: '🔍 토큰 검색 중...', ru: '🔍 Поиск токенов...', id: '🔍 Mencari token...' },
    swap_token_not_found: { en: '❌ Token "{token}" not found.', vi: '❌ Không tìm thấy token "{token}".', zh: '❌ 未找到代币"{token}"。', ko: '❌ 토큰 "{token}" 없음.', ru: '❌ Токен "{token}" не найден.', id: '❌ Token "{token}" tidak ditemukan.' },
    swap_no_route: { en: '❌ No swap route found.', vi: '❌ Không tìm thấy đường swap.', zh: '❌ 未找到兑换路径。', ko: '❌ 스왑 경로 없음.', ru: '❌ Маршрут не найден.', id: '❌ Rute swap tidak ditemukan.' },
    swap_quote_title: { en: 'Swap Quote', vi: 'Báo giá Swap', zh: '兑换报价', ko: '스왑 견적', ru: 'Котировка обмена', id: 'Penawaran Swap' },
    swap_from: { en: 'Send', vi: 'Gửi', zh: '发送', ko: '보내기', ru: 'Отправить', id: 'Kirim' },
    swap_to: { en: 'Receive', vi: 'Nhận', zh: '接收', ko: '받기', ru: 'Получить', id: 'Terima' },
    swap_price_impact: { en: 'Price Impact', vi: 'Tác động giá', zh: '价格影响', ko: '가격 영향', ru: 'Влияние на цену', id: 'Dampak Harga' },
    swap_gas: { en: 'Est. Gas Fee', vi: 'Phí gas', zh: '预估Gas费', ko: '예상 가스비', ru: 'Комиссия газа', id: 'Biaya Gas' },
    swap_dex_comparison: { en: 'DEX Route Comparison', vi: 'So sánh DEX', zh: 'DEX路线对比', ko: 'DEX 경로 비교', ru: 'Сравнение DEX', id: 'Perbandingan DEX' },
    swap_risk_warning: { en: 'RISK WARNING', vi: 'CẢNH BÁO RỦI RO', zh: '风险警告', ko: '위험 경고', ru: 'ПРЕДУПРЕЖДЕНИЕ', id: 'PERINGATAN RISIKO' },
    swap_honeypot_detected: { en: 'Honeypot detected! May not be sellable.', vi: 'Phát hiện Honeypot! Có thể không bán được.', zh: '检测到蜜罐！', ko: '허니팟 감지!', ru: 'Обнаружен хонипот!', id: 'Honeypot terdeteksi!' },
    swap_tax_rate: { en: 'Tax Rate', vi: 'Thuế giao dịch', zh: '交易税', ko: '거래세', ru: 'Налог', id: 'Pajak' },
    swap_note: { en: 'Quote only. Open OKX Wallet to execute.', vi: 'Chỉ là báo giá. Mở OKX Wallet để thực hiện.', zh: '仅供参考。请在OKX钱包中执行。', ko: '견적만 제공됩니다.', ru: 'Только котировка.', id: 'Hanya penawaran.' },
    swap_error: { en: '❌ Swap quote failed.', vi: '❌ Lỗi báo giá.', zh: '❌ 获取报价失败。', ko: '❌ 스왑 실패.', ru: '❌ Ошибка котировки.', id: '❌ Gagal swap.' },
    gas_loading: { en: '⏳ Checking gas prices...', vi: '⏳ Đang kiểm tra giá gas...', zh: '⏳ 查询Gas价格...', ko: '⏳ 가스 가격 조회 중...', ru: '⏳ Проверка газа...', id: '⏳ Memeriksa gas...' },
    gas_title: { en: 'Gas Prices', vi: 'Giá Gas', zh: 'Gas价格', ko: '가스 가격', ru: 'Цены на газ', id: 'Harga Gas' },
    gas_refresh: { en: 'Refresh', vi: 'Làm mới', zh: '刷新', ko: '새로고침', ru: 'Обновить', id: 'Segarkan' },
    gas_no_data: { en: 'No gas data available.', vi: 'Không có dữ liệu gas.', zh: '暂无Gas数据。', ko: '가스 데이터 없음.', ru: 'Нет данных о газе.', id: 'Data gas tidak tersedia.' },
    gas_error: { en: '❌ Failed to fetch gas prices.', vi: '❌ Lỗi lấy giá gas.', zh: '❌ 获取Gas价格失败。', ko: '❌ 가스 가격 조회 실패.', ru: '❌ Ошибка получения цен.', id: '❌ Gagal mengambil harga gas.' }
};

const locales = ['en', 'vi', 'zh', 'ko', 'ru', 'id'];

for (const locale of locales) {
    const filePath = path.join(__dirname, '..', 'locales', locale + '.json');
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        let added = 0;
        for (const [key, translations] of Object.entries(newKeys)) {
            if (!data[key]) {
                data[key] = translations[locale] || translations.en;
                added++;
            }
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        console.log(`Updated ${locale}.json: +${added} keys (total: ${Object.keys(data).length})`);
    } catch (err) {
        console.error(`Error with ${locale}: ${err.message}`);
    }
}
console.log(`Done! Added ${Object.keys(newKeys).length} new keys.`);
