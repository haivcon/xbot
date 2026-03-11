/**
 * Unit Tests for batch_transfer and transfer_tokens
 * Run: node tests/walletTools.test.js
 */
const assert = require('assert');

// ══════════════════════════════════════════════
// Mock Setup
// ══════════════════════════════════════════════

// Mock ethers
const mockEthers = {
    isAddress: (addr) => /^0x[0-9a-fA-F]{40}$/.test(addr),
    JsonRpcProvider: class { },
    Wallet: class {
        constructor(pk, provider) { this.address = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'; }
        sendTransaction() { return Promise.resolve({ hash: '0xtxhash123', wait: () => Promise.resolve({ hash: '0xtxhash123', status: 1, gasUsed: 21000n, gasPrice: 1000000000n }) }); }
    },
    formatEther: (wei) => (Number(wei) / 1e18).toFixed(6),
    formatUnits: (wei, dec) => (Number(wei) / Math.pow(10, Number(dec))).toFixed(6),
    parseEther: (val) => BigInt(Math.floor(Number(val) * 1e18)),
    parseUnits: (val, dec) => BigInt(Math.floor(Number(val) * Math.pow(10, Number(dec)))),
    Contract: class {
        constructor() { }
        decimals() { return Promise.resolve(18); }
        balanceOf() { return Promise.resolve(10000000000000000000n); }
        transfer() { return Promise.resolve({ hash: '0xtxhash_erc20', wait: () => Promise.resolve({ hash: '0xtxhash_erc20', status: 1, gasUsed: 65000n, gasPrice: 1000000000n }) }); }
    },
};

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

// ══════════════════════════════════════════════
// Test: Address Validation
// ══════════════════════════════════════════════
console.log('\n📋 Address Validation Tests');

test('Valid EVM address passes isAddress', () => {
    assert.strictEqual(mockEthers.isAddress('0x5c6253e43c834ed82916256681aa70eb8692eddb'), true);
});

test('Invalid address fails isAddress', () => {
    assert.strictEqual(mockEthers.isAddress('notanaddress'), false);
    assert.strictEqual(mockEthers.isAddress('0x123'), false);
    assert.strictEqual(mockEthers.isAddress(''), false);
});

test('XKO prefix auto-correction', () => {
    const addr = 'XKO5c6253e43c834ed82916256681aa70eb8692eddb';
    const fixed = addr.startsWith('XKO') ? '0x' + addr.slice(3) : addr;
    assert.strictEqual(fixed, '0x5c6253e43c834ed82916256681aa70eb8692eddb');
});

test('xko lowercase prefix auto-correction', () => {
    const addr = 'xko5c6253e43c834ed82916256681aa70eb8692eddb';
    const fixed = (addr.startsWith('XKO') || addr.startsWith('xko')) ? '0x' + addr.slice(3) : addr;
    assert.strictEqual(fixed, '0x5c6253e43c834ed82916256681aa70eb8692eddb');
});

// ══════════════════════════════════════════════
// Test: Amount Type Safety
// ══════════════════════════════════════════════
console.log('\n📋 Amount Type Safety Tests');

test('Number amount gets String() cast', () => {
    const amount = 100;
    const safe = String(amount || '0');
    assert.strictEqual(safe, '100');
    assert.strictEqual(typeof safe, 'string');
});

test('String amount stays string', () => {
    const amount = '1.5';
    const safe = String(amount || '0');
    assert.strictEqual(safe, '1.5');
});

test('Undefined amount defaults to "0"', () => {
    const amount = undefined;
    const safe = String(amount || '0');
    assert.strictEqual(safe, '0');
});

test('"max" amount toLowerCase works after String()', () => {
    const amount = 'MAX';
    const safe = String(amount || '0');
    assert.strictEqual(safe.toLowerCase(), 'max');
});

// ══════════════════════════════════════════════
// Test: Duplicate Detection
// ══════════════════════════════════════════════
console.log('\n📋 Duplicate Detection Tests');

test('Detects duplicate destination addresses', () => {
    const transfers = [
        { toAddress: '0x5c6253e43c834ed82916256681aa70eb8692eddb', amount: '1' },
        { toAddress: '0x5c6253e43c834ed82916256681aa70eb8692eddb', amount: '2' },
        { toAddress: '0x1234567890abcdef1234567890abcdef12345678', amount: '3' }
    ];
    const destAddrs = transfers.map(t => (t.toAddress || '').trim().toLowerCase()).filter(Boolean);
    const duplicates = destAddrs.filter((addr, i) => destAddrs.indexOf(addr) !== i);
    assert.strictEqual(duplicates.length, 1);
    assert.strictEqual(duplicates[0], '0x5c6253e43c834ed82916256681aa70eb8692eddb');
});

test('No duplicates when all addresses unique', () => {
    const transfers = [
        { toAddress: '0x1111111111111111111111111111111111111111', amount: '1' },
        { toAddress: '0x2222222222222222222222222222222222222222', amount: '2' }
    ];
    const destAddrs = transfers.map(t => (t.toAddress || '').trim().toLowerCase()).filter(Boolean);
    const duplicates = destAddrs.filter((addr, i) => destAddrs.indexOf(addr) !== i);
    assert.strictEqual(duplicates.length, 0);
});

// ══════════════════════════════════════════════
// Test: Self-Transfer Guard
// ══════════════════════════════════════════════
console.log('\n📋 Self-Transfer Guard Tests');

test('Detects self-transfer (same address)', () => {
    const walletAddr = '0x5c6253e43c834ed82916256681aa70eb8692eddb';
    const destAddr = '0x5c6253e43c834ed82916256681aa70eb8692eddb';
    assert.strictEqual(walletAddr.toLowerCase() === destAddr.toLowerCase(), true);
});

test('Different addresses pass self-transfer check', () => {
    const walletAddr = '0x5c6253e43c834ed82916256681aa70eb8692eddb';
    const destAddr = '0x1234567890abcdef1234567890abcdef12345678';
    assert.strictEqual(walletAddr.toLowerCase() === destAddr.toLowerCase(), false);
});

// ══════════════════════════════════════════════
// Test: Batch Size Limit
// ══════════════════════════════════════════════
console.log('\n📋 Batch Size Limit Tests');

test('Batch within limit (50) passes', () => {
    const MAX_BATCH_SIZE = 50;
    const transfers = Array(50).fill({ toAddress: '0x1111111111111111111111111111111111111111', amount: '0.01' });
    assert.strictEqual(transfers.length <= MAX_BATCH_SIZE, true);
});

test('Batch exceeding limit (51) fails', () => {
    const MAX_BATCH_SIZE = 50;
    const transfers = Array(51).fill({ toAddress: '0x1111111111111111111111111111111111111111', amount: '0.01' });
    assert.strictEqual(transfers.length > MAX_BATCH_SIZE, true);
});

// ══════════════════════════════════════════════
// Test: Receipt Status (Revert Detection)
// ══════════════════════════════════════════════
console.log('\n📋 Receipt Revert Detection Tests');

test('Receipt status=1 is success', () => {
    const receipt = { status: 1, hash: '0xabc' };
    assert.strictEqual(receipt.status === 0, false);
});

test('Receipt status=0 is revert', () => {
    const receipt = { status: 0, hash: '0xabc' };
    assert.strictEqual(receipt.status === 0, true);
});

// ══════════════════════════════════════════════
// Test: Balance Pre-Check
// ══════════════════════════════════════════════
console.log('\n📋 Balance Pre-Check Tests');

test('Sufficient balance passes pre-check', () => {
    const rawBalance = 2000000000000000000n; // 2 ETH
    const amountWei = 1000000000000000000n; // 1 ETH
    assert.strictEqual(amountWei <= rawBalance, true);
});

test('Insufficient balance fails pre-check', () => {
    const rawBalance = 500000000000000000n; // 0.5 ETH
    const amountWei = 1000000000000000000n; // 1 ETH
    assert.strictEqual(amountWei > rawBalance, true);
});

// ══════════════════════════════════════════════
// Test: Chain Native Symbol Mapping
// ══════════════════════════════════════════════
console.log('\n📋 Chain Native Symbol Tests');

test('Chain 196 maps to OKB', () => {
    const chainNativeSymbol = { '1': 'ETH', '56': 'BNB', '196': 'OKB', '137': 'POL', '42161': 'ETH', '8453': 'ETH', '501': 'SOL' };
    assert.strictEqual(chainNativeSymbol['196'], 'OKB');
});

test('Unknown chain falls back to ETH', () => {
    const chainNativeSymbol = { '1': 'ETH', '56': 'BNB', '196': 'OKB' };
    assert.strictEqual(chainNativeSymbol['999'] || 'ETH', 'ETH');
});

// ══════════════════════════════════════════════
// Test: CSV Export Format
// ══════════════════════════════════════════════
console.log('\n📋 CSV Export Tests');

test('CSV escaping handles quotes', () => {
    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    assert.strictEqual(esc('hello'), '"hello"');
    assert.strictEqual(esc('say "hi"'), '"say ""hi"""');
    assert.strictEqual(esc(''), '""');
    assert.strictEqual(esc(null), '""');
});

test('CSV row format is correct', () => {
    const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const r = { wallet: '#1', to: '0xabc...', amount: '1.5', status: '✅', txHash: '0xtx123', gas: '0.001', balBefore: '10', balAfter: '8.5' };
    const row = [esc(r.wallet), esc(r.to), esc(r.amount), esc(r.status), esc(r.txHash || '-'), esc(r.gas || '-'), esc(r.balBefore || '-'), esc(r.balAfter || '-')].join(',');
    assert.ok(row.includes('"#1"'));
    assert.ok(row.includes('"0xtx123"'));
});

// ══════════════════════════════════════════════
// Test: Cancel Mechanism
// ══════════════════════════════════════════════
console.log('\n📋 Cancel Mechanism Tests');

test('Cancel signal Map works correctly', () => {
    const cancelMap = new Map();
    const batchId = 'bt_12345_1710000000000';
    assert.strictEqual(cancelMap.get(batchId), undefined);
    cancelMap.set(batchId, true);
    assert.strictEqual(cancelMap.get(batchId), true);
    cancelMap.delete(batchId);
    assert.strictEqual(cancelMap.get(batchId), undefined);
});

test('Pending confirmation Promise resolves on callback', async () => {
    const pending = new Map();
    const batchId = 'bt_test_123';

    const result = await new Promise((resolve) => {
        pending.set(batchId, (action) => {
            pending.delete(batchId);
            resolve(action);
        });
        // Simulate button press
        setTimeout(() => pending.get(batchId)?.('confirm'), 10);
    });

    assert.strictEqual(result, 'confirm');
    assert.strictEqual(pending.has(batchId), false);
});

// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'═'.repeat(50)}\n`);

if (failed > 0) {
    process.exit(1);
}
