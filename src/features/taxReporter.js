/**
 * #24 Crypto Tax Reporter — Automated tax report generation
 * Features: trade history parsing, cost basis calculation, gain/loss categories, export
 */
'use strict';

const log = { info: (...a) => console.log('[TaxReporter]', ...a) };

// ─── Tax Calculation Methods ───
const COST_BASIS_METHODS = {
  fifo: 'First In, First Out',
  lifo: 'Last In, First Out',
  average: 'Average Cost'
};

class TaxReporter {
  constructor(taxYear, method = 'fifo') {
    this.taxYear = taxYear;
    this.method = method;
    this.trades = [];
    this.summary = null;
  }

  addTrade(trade) {
    this.trades.push({
      type: trade.type, // BUY, SELL, SWAP
      fromToken: trade.fromToken,
      toToken: trade.toToken,
      fromAmount: trade.fromAmount,
      toAmount: trade.toAmount,
      priceUsd: trade.priceUsd || 0,
      fee: trade.fee || 0,
      feeUsd: trade.feeUsd || 0,
      txHash: trade.txHash,
      chain: trade.chain || 'X Layer',
      timestamp: trade.timestamp || Date.now()
    });
  }

  calculateGains() {
    const lots = {}; // token -> [{ amount, costBasis, date }]
    const gains = [];

    for (const trade of this.trades.sort((a, b) => a.timestamp - b.timestamp)) {
      if (trade.type === 'BUY') {
        if (!lots[trade.toToken]) lots[trade.toToken] = [];
        lots[trade.toToken].push({
          amount: trade.toAmount,
          costBasis: trade.priceUsd * trade.toAmount + (trade.feeUsd || 0),
          date: trade.timestamp
        });
      } else if (trade.type === 'SELL' || trade.type === 'SWAP') {
        const tokenLots = lots[trade.fromToken] || [];
        let remaining = trade.fromAmount;
        const proceeds = trade.priceUsd * trade.fromAmount;

        while (remaining > 0 && tokenLots.length > 0) {
          const lot = this.method === 'lifo' ? tokenLots[tokenLots.length - 1] : tokenLots[0];
          const used = Math.min(remaining, lot.amount);
          const costBasis = (used / lot.amount) * lot.costBasis;
          const gain = (used / trade.fromAmount) * proceeds - costBasis;
          const holdingDays = (trade.timestamp - lot.date) / 86400000;

          gains.push({
            token: trade.fromToken,
            amount: used,
            costBasis: Math.round(costBasis * 100) / 100,
            proceeds: Math.round((used / trade.fromAmount) * proceeds * 100) / 100,
            gain: Math.round(gain * 100) / 100,
            isLongTerm: holdingDays > 365,
            holdingDays: Math.round(holdingDays),
            date: new Date(trade.timestamp).toISOString().split('T')[0]
          });

          lot.amount -= used;
          lot.costBasis -= costBasis;
          remaining -= used;
          if (lot.amount <= 0) {
            if (this.method === 'lifo') tokenLots.pop();
            else tokenLots.shift();
          }
        }
      }
    }

    const shortTermGains = gains.filter(g => !g.isLongTerm).reduce((sum, g) => sum + g.gain, 0);
    const longTermGains = gains.filter(g => g.isLongTerm).reduce((sum, g) => sum + g.gain, 0);
    const totalFees = this.trades.reduce((sum, t) => sum + (t.feeUsd || 0), 0);

    this.summary = {
      taxYear: this.taxYear,
      method: COST_BASIS_METHODS[this.method],
      totalTrades: this.trades.length,
      totalGains: gains,
      shortTermGains: Math.round(shortTermGains * 100) / 100,
      longTermGains: Math.round(longTermGains * 100) / 100,
      netGain: Math.round((shortTermGains + longTermGains) * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100
    };

    return this.summary;
  }

  exportCSV() {
    if (!this.summary) this.calculateGains();
    const header = 'Date,Token,Amount,Cost Basis,Proceeds,Gain/Loss,Type,Holding Days';
    const rows = this.summary.totalGains.map(g =>
      `${g.date},${g.token},${g.amount},${g.costBasis},${g.proceeds},${g.gain},${g.isLongTerm ? 'Long' : 'Short'},${g.holdingDays}`
    );
    return [header, ...rows].join('\n');
  }
}

module.exports = { TaxReporter, COST_BASIS_METHODS };
