const fs = require('fs');

const data = fs.readFileSync('dashboard/src/i18n/index.js', 'utf8');

const strings = {
    0: `{
            smartCopyPage: { title: 'Smart Copy-Trader', subtitle: 'Zero-click AI copy-trading — automatically follows top whale & Smart Money traders on X Layer', copySession: 'Copy Session', active: 'Active', inactive: 'Inactive', budgetUsed: 'Budget Used', totalCopies: 'Total Copies', pnl: 'PnL', remaining: 'Remaining', polling: 'Polling', pollingActive: 'Active', pollingPaused: 'Paused', setBudgetLabel: 'Budget (USDT):', btnStart: 'Start Auto Copy', btnStarting: 'Starting...', btnStop: 'Stop Copy Session', btnStopping: 'Stopping...', topTraders: 'Top Traders', btnDiscover: 'Discover', noLeaders: 'No leaders discovered yet. Click "Discover" to find top traders on X Layer.', leaderWin: 'Win', leaderPnl: 'PnL', recentCopyTrades: 'Recent Copy Trades', buyFrom: 'From', loading: 'Loading...' },
        dashboard: {`,
    1: `{
            smartCopyPage: { title: 'Smart Copy-Trader', subtitle: 'Giao dịch tự động AI — tự động sao chép thao tác của CÁ MẬP & SMART MONEY trên X Layer', copySession: 'Phiên Copy', active: 'Đang chạy', inactive: 'Đã dừng', budgetUsed: 'Ngân sách', totalCopies: 'Tổng lệnh', pnl: 'Lợi nhuận', remaining: 'Còn lại', polling: 'Quét tín hiệu', pollingActive: 'Đang quét', pollingPaused: 'Đã dừng', setBudgetLabel: 'Ngân sách (USDT):', btnStart: 'Bắt đầu Copy', btnStarting: 'Đang bắt đầu...', btnStop: 'Dừng phiên Copy', btnStopping: 'Đang dừng...', topTraders: 'Cá Mập & Top Giao dịch', btnDiscover: 'Khám phá', noLeaders: 'Chưa tìm thấy cá mập. Nhấn "Khám phá" để quét tín hiệu X Layer.', leaderWin: 'Thắng', leaderPnl: 'Lợi nhuận', recentCopyTrades: 'Lệnh Copy Mới nhất', buyFrom: 'Khoáng lệnh từ', loading: 'Đang tải...' },
        dashboard: {`,
    2: `{
            smartCopyPage: { title: 'Smart Copy-Trader', subtitle: 'AI 自动跟单 — 自动跟随 X Layer 上的巨鲸和聪明钱账户', copySession: '跟单会话', active: '运行中', inactive: '已停止', budgetUsed: '已用预算', totalCopies: '总跟单数', pnl: '盈亏', remaining: '剩余金额', polling: '信号扫描', pollingActive: '扫描中', pollingPaused: '已暂停', setBudgetLabel: '预算 (USDT):', btnStart: '开始自动跟单', btnStarting: '启动中...', btnStop: '停止跟单会话', btnStopping: '停止中...', topTraders: '顶级交易员', btnDiscover: '发现', noLeaders: '还未发现交易员。点击“发现”寻找 X Layer 的顶尖跑者。', leaderWin: '胜率', leaderPnl: '盈亏', recentCopyTrades: '最新跟单记录', buyFrom: '跟单', loading: '加载中...' },
        dashboard: {`,
    3: `{
            smartCopyPage: { title: 'Smart Copy-Trader', subtitle: 'AI 자동 카피 트레이딩 — X Layer의 고래 & 스마트 머니 트레이더를 자동으로 팔로우합니다', copySession: '카피 세션', active: '진행 중', inactive: '비활성', budgetUsed: '사용한 예산', totalCopies: '총 복사 횟수', pnl: '손익', remaining: '남은 금액', polling: '신호 스캔', pollingActive: '스캔 중', pollingPaused: '일시 정지', setBudgetLabel: '예산(USDT):', btnStart: '자동 카피 시작', btnStarting: '시작 중...', btnStop: '세션 중지', btnStopping: '중지 중...', topTraders: '탑 트레이더', btnDiscover: '트레이더 검색', noLeaders: '아직 트레이더를 찾지 못했습니다. "검색"을 눌러주세요.', leaderWin: '승률', leaderPnl: '손익', recentCopyTrades: '최근 복사 거래', buyFrom: '대상', loading: '로딩 중...' },
        dashboard: {`,
    4: `{
            smartCopyPage: { title: 'Smart Copy-Trader', subtitle: 'AI копи-трейдинг — автоматическое копирование китов и Smart Money на X Layer', copySession: 'Сессия копирования', active: 'Активно', inactive: 'Неактивно', budgetUsed: 'Использован бюджет', totalCopies: 'Всего скопировано', pnl: 'Прибыль', remaining: 'Остаток', polling: 'Поиск сигналов', pollingActive: 'Идет поиск', pollingPaused: 'Пауза', setBudgetLabel: 'Бюджет (USDT):', btnStart: 'Начать авто-копирование', btnStarting: 'Запуск...', btnStop: 'Остановить сессию', btnStopping: 'Остановка...', topTraders: 'Лучшие трейдеры', btnDiscover: 'Поиск', noLeaders: 'Трейдеры еще не найдены. Нажмите "Поиск", чтобы найти топ-трейдеров X Layer.', leaderWin: 'Побед', leaderPnl: 'PnL', recentCopyTrades: 'Последние сделки', buyFrom: 'От', loading: 'Загрузка...' },
        dashboard: {`,
    5: `{
            smartCopyPage: { title: 'Smart Copy-Trader', subtitle: 'AI Copy-Trading otomatis — secara otomatis mengikuti Whale & Smart Money di X Layer', copySession: 'Sesi Copy', active: 'Aktif', inactive: 'Tidak Aktif', budgetUsed: 'Anggaran Digunakan', totalCopies: 'Total Salinan', pnl: 'PnL', remaining: 'Sisa', polling: 'Pemindaian Sinyal', pollingActive: 'Aktif', pollingPaused: 'Dijeda', setBudgetLabel: 'Anggaran (USDT):', btnStart: 'Mulai Auto Copy', btnStarting: 'Memulai...', btnStop: 'Hentikan Sesi', btnStopping: 'Menghentikan...', topTraders: 'Trader Teratas', btnDiscover: 'Temukan', noLeaders: 'Belum ada trader yang ditemukan. Klik "Temukan" untuk mencari trader.', leaderWin: 'Menang', leaderPnl: 'PnL', recentCopyTrades: 'Perdagangan Salinan Terbaru', buyFrom: 'Dari', loading: 'Memuat...' },
        dashboard: {`
};

let i = 0;
const newData = data.replace(/\{\s+dashboard: \{/g, function(match) {
    const replacement = strings[i];
    i++;
    return replacement || match;
});

fs.writeFileSync('dashboard/src/i18n/index.js', newData, 'utf8');
console.log('Inserted smartCopyPage into all 6 languages.');
