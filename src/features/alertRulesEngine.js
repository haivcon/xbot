/**
 * #18 Custom Alert Rules Engine — Multi-condition alert system
 * Features: natural language → structured conditions, multi-source polling, trigger actions
 */
'use strict';

const log = { info: (...a) => console.log('[AlertRules]', ...a) };

// ─── Condition Types ───
const CONDITION_TYPES = {
  price_above: { label: 'Price above', source: 'market/price', check: (val, target) => val > target },
  price_below: { label: 'Price below', source: 'market/price', check: (val, target) => val < target },
  price_change: { label: 'Price change %', source: 'market/price', check: (val, target) => Math.abs(val) > target },
  whale_buys: { label: 'Whale buy count ≥', source: 'signal/list', check: (val, target) => val >= target },
  smart_money_buys: { label: 'Smart Money buy count ≥', source: 'signal/list', check: (val, target) => val >= target },
  holder_count: { label: 'Holder count ≥', source: 'token/holder', check: (val, target) => val >= target },
  volume_above: { label: 'Volume above $', source: 'market/trades', check: (val, target) => val > target },
  portfolio_loss: { label: 'Portfolio loss % >', source: 'portfolio/pnl', check: (val, target) => val > target },
  dev_rug: { label: 'Dev has rug history', source: 'memepump/devInfo', check: (val) => val > 0 }
};

// ─── Alert Rule ───
class AlertRule {
  constructor(config) {
    this.id = config.id || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.userId = config.userId;
    this.name = config.name || 'Custom Alert';
    this.conditions = config.conditions || []; // [{ type, token, target, operator }]
    this.logicOperator = config.logicOperator || 'AND'; // AND / OR
    this.checkInterval = config.checkInterval || 60000; // 60s
    this.active = true;
    this.triggerCount = 0;
    this.maxTriggers = config.maxTriggers || 1;
    this.createdAt = Date.now();
    this.lastChecked = null;
    this.lastTriggered = null;
  }

  async evaluate(dataFetchers = {}) {
    const results = [];
    for (const cond of this.conditions) {
      const condType = CONDITION_TYPES[cond.type];
      if (!condType) { results.push(false); continue; }
      try {
        const fetcher = dataFetchers[cond.type];
        if (!fetcher) { results.push(false); continue; }
        const value = await fetcher(cond.token, cond);
        results.push(condType.check(value, cond.target));
      } catch (e) { results.push(false); }
    }

    this.lastChecked = Date.now();
    const triggered = this.logicOperator === 'AND'
      ? results.every(Boolean)
      : results.some(Boolean);

    if (triggered) {
      this.triggerCount++;
      this.lastTriggered = Date.now();
      if (this.triggerCount >= this.maxTriggers) this.active = false;
    }

    return { triggered, results, conditions: this.conditions };
  }
}

// ─── Rules Store ───
const alertRules = new Map(); // userId -> AlertRule[]

function createRule(userId, config) {
  const rule = new AlertRule({ ...config, userId });
  if (!alertRules.has(userId)) alertRules.set(userId, []);
  alertRules.get(userId).push(rule);
  log.info(`Rule "${rule.name}" created for ${userId}`);
  return rule;
}

function getUserRules(userId) {
  return (alertRules.get(userId) || []).filter(r => r.active);
}

function deleteRule(userId, ruleId) {
  const rules = alertRules.get(userId);
  if (!rules) return false;
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx >= 0) { rules.splice(idx, 1); return true; }
  return false;
}

// ─── NLP Parser (simple) ───
function parseAlertFromText(text) {
  const conditions = [];
  const lower = text.toLowerCase();

  // Price conditions
  const priceMatch = lower.match(/(\w+)\s+(?:price\s+)?(?:goes?\s+)?(?:above|over|>)\s+\$?([\d.]+)/);
  if (priceMatch) conditions.push({ type: 'price_above', token: priceMatch[1].toUpperCase(), target: parseFloat(priceMatch[2]) });

  const priceBelow = lower.match(/(\w+)\s+(?:price\s+)?(?:goes?\s+)?(?:below|under|<)\s+\$?([\d.]+)/);
  if (priceBelow) conditions.push({ type: 'price_below', token: priceBelow[1].toUpperCase(), target: parseFloat(priceBelow[2]) });

  // Whale conditions
  const whaleMatch = lower.match(/(\d+)\s+(?:or more\s+)?(?:whale|cá voi)/);
  if (whaleMatch) conditions.push({ type: 'whale_buys', target: parseInt(whaleMatch[1]) });

  // Smart money
  const smMatch = lower.match(/(\d+)\s+(?:or more\s+)?smart\s*money/);
  if (smMatch) conditions.push({ type: 'smart_money_buys', target: parseInt(smMatch[1]) });

  const hasAnd = /\band\b|và/.test(lower);
  return { conditions, logicOperator: hasAnd ? 'AND' : 'OR' };
}

module.exports = {
  CONDITION_TYPES,
  AlertRule,
  alertRules,
  createRule,
  getUserRules,
  deleteRule,
  parseAlertFromText
};
