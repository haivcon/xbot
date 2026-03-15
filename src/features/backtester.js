/**
 * #25 AI Trading Strategy Backtester — Test strategies against historical data
 * Features: strategy definition, historical simulation, performance metrics
 */
'use strict';

const log = { info: (...a) => console.log('[Backtester]', ...a) };

// ─── Strategy Types ───
const STRATEGY_TEMPLATES = {
  dca_fixed: {
    name: 'Fixed DCA',
    description: 'Buy fixed amount at regular intervals',
    params: { amount: 10, interval: 'daily' }
  },
  smart_dca: {
    name: 'Smart DCA',
    description: 'DCA with MA20/RSI adjustments',
    params: { amount: 10, interval: 'daily', adjustByMA: true, adjustByRSI: true }
  },
  ma_crossover: {
    name: 'MA Crossover',
    description: 'Buy when short MA crosses above long MA',
    params: { shortPeriod: 10, longPeriod: 30, buyAmount: 100 }
  },
  rsi_bounce: {
    name: 'RSI Bounce',
    description: 'Buy when RSI drops below 30, sell above 70',
    params: { buyThreshold: 30, sellThreshold: 70, amount: 100 }
  },
  whale_follow: {
    name: 'Whale Follow',
    description: 'Buy when whales buy, sell when whales sell',
    params: { minWhaleTrades: 2, buyAmount: 50 }
  }
};

// ─── Backtest Engine ───
class BacktestEngine {
  constructor(strategy, candles, options = {}) {
    this.strategy = strategy;
    this.candles = candles; // [{ ts, open, high, low, close, volume }]
    this.initialCapital = options.initialCapital || 1000;
    this.feePercent = options.feePercent || 0.3;
    this.results = null;
  }

  run() {
    let cash = this.initialCapital;
    let holdings = 0;
    const trades = [];

    for (let i = 30; i < this.candles.length; i++) {
      const candle = this.candles[i];
      const signal = this._getSignal(i);

      if (signal === 'BUY' && cash > 0) {
        const amount = Math.min(cash, this.strategy.params?.buyAmount || this.strategy.params?.amount || cash * 0.1);
        const fee = amount * (this.feePercent / 100);
        const tokens = (amount - fee) / candle.close;
        cash -= amount;
        holdings += tokens;
        trades.push({ type: 'BUY', price: candle.close, amount, tokens, fee, ts: candle.ts });
      } else if (signal === 'SELL' && holdings > 0) {
        const revenue = holdings * candle.close;
        const fee = revenue * (this.feePercent / 100);
        cash += (revenue - fee);
        trades.push({ type: 'SELL', price: candle.close, amount: revenue, tokens: holdings, fee, ts: candle.ts });
        holdings = 0;
      }
    }

    // Final value
    const lastPrice = this.candles[this.candles.length - 1].close;
    const finalValue = cash + (holdings * lastPrice);
    const totalReturn = ((finalValue - this.initialCapital) / this.initialCapital) * 100;
    const buyHoldReturn = ((lastPrice - this.candles[30].close) / this.candles[30].close) * 100;

    const wins = trades.filter(t => t.type === 'SELL').filter((t, i) => {
      const prevBuy = trades.filter(tr => tr.type === 'BUY')[i];
      return prevBuy && t.price > prevBuy.price;
    }).length;
    const totalSells = trades.filter(t => t.type === 'SELL').length;

    this.results = {
      strategyName: this.strategy.name,
      initialCapital: this.initialCapital,
      finalValue: Math.round(finalValue * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
      buyHoldReturn: Math.round(buyHoldReturn * 100) / 100,
      alpha: Math.round((totalReturn - buyHoldReturn) * 100) / 100,
      totalTrades: trades.length,
      winRate: totalSells ? Math.round((wins / totalSells) * 100) : 0,
      maxDrawdown: this._calcMaxDrawdown(trades, this.candles),
      trades
    };

    return this.results;
  }

  _getSignal(i) {
    const c = this.candles;
    if (this.strategy.name === 'Fixed DCA' || this.strategy.name === 'Smart DCA') {
      return (i % 24 === 0) ? 'BUY' : 'HOLD'; // Buy every 24 candles
    }
    if (this.strategy.name === 'MA Crossover') {
      const short = this._sma(c, i, this.strategy.params.shortPeriod || 10);
      const long = this._sma(c, i, this.strategy.params.longPeriod || 30);
      const prevShort = this._sma(c, i - 1, this.strategy.params.shortPeriod || 10);
      const prevLong = this._sma(c, i - 1, this.strategy.params.longPeriod || 30);
      if (prevShort <= prevLong && short > long) return 'BUY';
      if (prevShort >= prevLong && short < long) return 'SELL';
    }
    if (this.strategy.name === 'RSI Bounce') {
      const rsi = this._rsi(c, i, 14);
      if (rsi < (this.strategy.params.buyThreshold || 30)) return 'BUY';
      if (rsi > (this.strategy.params.sellThreshold || 70)) return 'SELL';
    }
    return 'HOLD';
  }

  _sma(candles, endIdx, period) {
    let sum = 0;
    for (let i = endIdx - period + 1; i <= endIdx; i++) sum += candles[i].close;
    return sum / period;
  }

  _rsi(candles, idx, period = 14) {
    let gains = 0, losses = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const rs = gains / (losses || 1);
    return 100 - (100 / (1 + rs));
  }

  _calcMaxDrawdown() {
    let peak = this.initialCapital, maxDD = 0;
    let running = this.initialCapital;
    for (const t of (this.results?.trades || [])) {
      if (t.type === 'BUY') running -= t.amount;
      else running += t.amount;
      if (running > peak) peak = running;
      const dd = ((peak - running) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return Math.round(maxDD * 100) / 100;
  }
}

// ─── Format Report ───
function formatBacktestReport(results, lang = 'en') {
  const isVi = lang === 'vi';
  return [
    `📊 <b>${isVi ? 'Kết quả Backtest' : 'Backtest Results'}: ${results.strategyName}</b>`,
    '',
    `💰 ${isVi ? 'Vốn ban đầu' : 'Initial'}: $${results.initialCapital}`,
    `📈 ${isVi ? 'Giá trị cuối' : 'Final Value'}: $${results.finalValue}`,
    `🎯 ${isVi ? 'Lợi nhuận' : 'Return'}: ${results.totalReturn}%`,
    `📊 Buy & Hold: ${results.buyHoldReturn}%`,
    `⚡ Alpha: ${results.alpha > 0 ? '+' : ''}${results.alpha}%`,
    `🔄 ${isVi ? 'Tổng lệnh' : 'Trades'}: ${results.totalTrades}`,
    `✅ Win Rate: ${results.winRate}%`,
    `📉 Max Drawdown: ${results.maxDrawdown}%`
  ].join('\n');
}

module.exports = {
  BacktestEngine,
  STRATEGY_TEMPLATES,
  formatBacktestReport
};
