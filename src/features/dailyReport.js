/**
 * #17 AI Daily Market Commentary — Automated morning market report
 * Features: market overview, whale activity, meme spotlight, portfolio summary, AI verdict
 */
'use strict';

const log = { info: (...a) => console.log('[DailyReport]', ...a) };

// ─── Report Builder ───
async function buildDailyReport(options = {}) {
  const { priceFn, signalFn, portfolioFn, memeFn, gasFn, userId, lang = 'en' } = options;
  const sections = [];
  const isVi = lang === 'vi';

  // 1. Market Overview
  const topTokens = ['ETH', 'BTC', 'OKB', 'SOL', 'BNB'];
  const prices = {};
  if (priceFn) {
    for (const t of topTokens) {
      try { prices[t] = await priceFn(t); } catch (e) { /* skip */ }
    }
  }
  if (Object.keys(prices).length) {
    sections.push(isVi ? '📈 <b>Thị trường 24h:</b>' : '📈 <b>Market 24h:</b>');
    for (const [sym, data] of Object.entries(prices)) {
      const change = data.change24h ? ` (${data.change24h > 0 ? '+' : ''}${data.change24h.toFixed(1)}%)` : '';
      sections.push(`• ${sym}: $${(data.price || 0).toFixed(2)}${change}`);
    }
    sections.push('');
  }

  // 2. Whale Activity
  if (signalFn) {
    try {
      const signals = await signalFn({ types: [1, 3], limit: 10 });
      if (signals?.length) {
        sections.push(isVi ? '🐋 <b>Hoạt động cá voi:</b>' : '🐋 <b>Whale Activity:</b>');
        const grouped = {};
        for (const s of signals) {
          const key = s.tokenSymbol || 'unknown';
          if (!grouped[key]) grouped[key] = { buys: 0, totalUsd: 0 };
          grouped[key].buys++;
          grouped[key].totalUsd += (s.amountUsd || 0);
        }
        for (const [token, data] of Object.entries(grouped).slice(0, 5)) {
          sections.push(`• ${data.buys} ${isVi ? 'cá voi mua' : 'whale buys'} $${token} ($${(data.totalUsd / 1000).toFixed(1)}K)`);
        }
        sections.push('');
      }
    } catch (e) { /* skip */ }
  }

  // 3. Meme Spotlight
  if (memeFn) {
    try {
      const memes = await memeFn({ limit: 3, stage: 'NEW' });
      if (memes?.length) {
        sections.push(isVi ? '🆕 <b>Meme đáng chú ý:</b>' : '🆕 <b>Meme Spotlight:</b>');
        for (const m of memes) {
          const devStatus = m.devClean ? '✅' : '⚠️';
          sections.push(`• $${m.symbol} — ${m.holders || '?'} holders, dev ${devStatus}`);
        }
        sections.push('');
      }
    } catch (e) { /* skip */ }
  }

  // 4. Portfolio Summary
  if (portfolioFn && userId) {
    try {
      const pf = await portfolioFn(userId);
      if (pf) {
        sections.push(isVi ? '💼 <b>Portfolio của bạn:</b>' : '💼 <b>Your Portfolio:</b>');
        sections.push(`• ${isVi ? 'Tổng' : 'Total'}: $${(pf.totalValue || 0).toFixed(2)}`);
        if (pf.change24h) sections.push(`• 24h: ${pf.change24h > 0 ? '+' : ''}$${pf.change24h.toFixed(2)}`);
        sections.push('');
      }
    } catch (e) { /* skip */ }
  }

  return {
    title: isVi ? `🌅 <b>BẢN TIN XBot — ${new Date().toLocaleDateString('vi-VN')}</b>` :
                   `🌅 <b>XBot Daily — ${new Date().toLocaleDateString('en-US')}</b>`,
    content: sections.join('\n'),
    generatedAt: Date.now()
  };
}

function formatDailyReport(report) {
  return `${report.title}\n━━━━━━━━━━━━━━━━━━━━\n${report.content}\n━━━━━━━━━━━━━━━━━━━━`;
}

module.exports = {
  buildDailyReport,
  formatDailyReport
};
