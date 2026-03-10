/**
 * Minimal test: verify Gemini function calling with @google/genai v1.30.0
 * No DB dependency - just test the API call pattern
 */
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

// Get key from env or pass as arg
const { GEMINI_API_KEYS } = require('./src/config/env');

async function main() {
    let apiKey = null;
    if (GEMINI_API_KEYS && GEMINI_API_KEYS.length > 0) {
        apiKey = GEMINI_API_KEYS[0];
        console.log('Using env key');
    }
    
    if (!apiKey) {
        // Try to read from DB directly via sqlite
        const Database = require('better-sqlite3');
        const dbPath = require('path').join(__dirname, 'data', 'bot.db');
        const sqliteDb = new Database(dbPath, { readonly: true });
        const rows = sqliteDb.prepare('SELECT apiKey, provider FROM user_ai_keys WHERE provider IN (?, ?) LIMIT 3').all('google', 'gemini');
        console.log('DB keys found:', rows.map(r => ({ provider: r.provider, key: r.apiKey?.substring(0, 10) + '...' })));
        if (rows.length > 0) {
            apiKey = rows[0].apiKey;
        }
        sqliteDb.close();
    }
    
    if (!apiKey) {
        console.error('No API key found!');
        process.exit(1);
    }
    
    console.log('Key prefix:', apiKey.substring(0, 10) + '...');
    const client = new GoogleGenAI({ apiKey });

    const tools = [{
        functionDeclarations: [{
            name: 'get_trading_wallet_balance',
            description: 'Check user trading wallet balance and portfolio on-chain. Use when user asks about balance, wallet, assets.',
            parameters: {
                type: 'object',
                properties: {
                    walletId: { type: 'string', description: 'Wallet ID (optional, uses default if omitted)' }
                }
            }
        }]
    }];

    const systemInstruction = `You are an AI trading assistant. You MUST call get_trading_wallet_balance when user asks about wallet/balance.
USER'S TRADING WALLETS:
- ID:5 "banmao" 0x5c6253e43C834ed82916256681aA70EB8692Eddb (DEFAULT ⭐)
When user asks "check my wallet", call get_trading_wallet_balance immediately. DO NOT ask for their address.`;

    const contents = [{ role: 'user', parts: [{ text: 'Check my wallet balance' }] }];

    console.log('\n=== Test 1: config.tools (current web chat) ===');
    try {
        const r1 = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            systemInstruction,
            config: { tools }
        });
        console.log('functionCalls:', r1.functionCalls?.length || 0);
        if (r1.functionCalls?.length) console.log('  →', r1.functionCalls[0].name, JSON.stringify(r1.functionCalls[0].args));
        const parts1 = r1.candidates?.[0]?.content?.parts || [];
        console.log('Parts:', parts1.map(p => p.text ? `text:"${p.text.substring(0,60)}..."` : p.functionCall ? `FN:${p.functionCall.name}` : '?').join(', '));
    } catch (e) { console.error('ERR:', e.message?.substring(0, 150)); }

    await new Promise(r => setTimeout(r, 2000));

    console.log('\n=== Test 2: top-level tools ===');
    try {
        const r2 = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            systemInstruction,
            tools
        });
        console.log('functionCalls:', r2.functionCalls?.length || 0);
        if (r2.functionCalls?.length) console.log('  →', r2.functionCalls[0].name, JSON.stringify(r2.functionCalls[0].args));
        const parts2 = r2.candidates?.[0]?.content?.parts || [];
        console.log('Parts:', parts2.map(p => p.text ? `text:"${p.text.substring(0,60)}..."` : p.functionCall ? `FN:${p.functionCall.name}` : '?').join(', '));
    } catch (e) { console.error('ERR:', e.message?.substring(0, 150)); }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
