const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const removedFiles = [
    'dashboard/xBot/src/pages/user/AiTraderPage.jsx',
    'dashboard/xBot/src/components/AiTraderPanel.jsx',
    'dashboard/xBot/src/pages/user/SmartCopyPage.jsx',
    'dashboard/xBot/src/pages/user/OKXAIPage.jsx',
    'src/features/autoTrading.js',
    'src/features/tradeExecutionEngine.js',
    'src/features/smartCopyEngine.js',
    'src/features/ai/onchain/smartCopyTools.js',
    'src/commands/okxai.js',
    'src/features/ai/okxaiTools.js',
    'src/services/okxai/index.js',
    'src/services/okxai/agent.js',
    'src/services/okxai/taskManager.js',
    'src/services/okxai/a2a.js',
    'src/services/okxai/wallet.js',
    'src/services/okxai/x402Enhanced.js',
    'src/services/agentRuntime/index.js',
    'src/services/agentRuntime/policy.js',
    'src/services/agentRuntime/limits.js',
    'src/services/agentRuntime/toolRegistry.js',
    'src/services/agentRuntime/inbox.js',
    'src/services/agentRuntime/audit.js',
    '__tests__/agentRuntime.test.js',
    'docs/OKXAI_AGENT_RUNTIME.md',
    'docs/XBOT_OKXAI_BRIDGE_SETUP_MULTILANGUAGE.md',
    'src/features/copyTrading.js',
    'src/features/smartOrderExecutor.js',
];

describe('legacy AI and copy surfaces are retired', () => {
    test('legacy implementation files are deleted', () => {
        for (const relativePath of removedFiles) {
            expect(fs.existsSync(path.join(ROOT, relativePath))).toBe(false);
        }
    });

    test('old dashboard URLs intentionally redirect to Chat AI without old imports', () => {
        const app = read('dashboard/xBot/src/App.jsx');
        expect(app).not.toMatch(/AiTraderPage|SmartCopyPage|OKXAIPage/);
        for (const route of ['ai-trader', 'smart-copy', 'okx-ai']) {
            expect(app).toContain(`<Route path="${route}" element={<Navigate to="/chat" />} />`);
        }
    });

    test('AI & Chat navigation contains Chat AI only', () => {
        const sidebar = read('dashboard/xBot/src/components/layout/Sidebar.jsx');
        const aiGroup = sidebar.match(/key: 'ai',[\s\S]*?\n\s*},\n\s*{\n\s*key: 'finance'/)?.[0] || '';
        expect(aiGroup).toContain("to: '/chat'");
        expect(aiGroup).not.toMatch(/ai-trader|smart-copy|okx-ai|AI Trader|Smart Copy|OKX\.AI/);
    });

    test('Chat AI has no legacy trading panel or copy/auto-trading prompts', () => {
        expect(read('dashboard/xBot/src/pages/user/ChatPage.jsx')).not.toMatch(
            /AiTraderPanel|showAiTrader|\/copy-trade|\/auto-trade|Copy trading|AI Auto Trading/
        );
    });

    test('old private APIs and custom OKX AI tools are unreachable', () => {
        expect(read('src/server/dashboardRoutes.js')).not.toMatch(/['"]\/(?:smart-copy|okxai|agent-runtime)(?:\/|['"])/);
        expect(read('src/server/chatRoutes.js')).not.toMatch(/okxaiTools|OkxAi|okxaiDecls|isOkxAiToolName/);
    });

    test('Chat routes preserve the web-tool executor call contract', () => {
        const routes = read('src/server/chatRoutes.js');
        expect(routes).toContain('executeWebToolCall(call, context)');
        expect(routes).toContain('executeToolCall(call, context)');
    });

    test('Chat V2 does not persist or emit done for a cancelled upstream run', () => {
        const routes = read('src/server/chatRoutes.js');
        expect(routes).toMatch(/if \(!result\.completed \|\| aborted\) \{[\s\S]*?return res\.end\(\);[\s\S]*?\}/);
    });

    test('xBot agent approvals are exposed through a tenant-bound Node route and all chat surfaces handle them', () => {
        const routes = read('src/server/chatRoutes.js');
        const api = read('dashboard/xBot/src/api/client.js');
        expect(routes).toContain("router.post('/chat/agent/:runId/approval'");
        expect(routes).toContain('const tenantId = normalizeTenantId(userId)');
        expect(routes).toContain('tenantId, userId: tenantId, runId, choice');
        expect(routes).not.toMatch(/req\.(?:body|query|headers)[^\n]*tenantId/);
        expect(routes).toContain("if (!['once', 'deny'].includes(choice))");
        expect(api).toContain("currentEvent === 'approval-required'");
        expect(api).toContain("approved ? 'once' : 'deny'");
        for (const file of [
            'dashboard/xBot/src/pages/user/ChatPage.jsx',
            'dashboard/xBot/src/components/ChatWidget.jsx',
            'dashboard/xBot/src/components/chat/FloatingChat.jsx'
        ]) {
            expect(read(file)).toContain('onApprovalRequired: data => api.confirmAgentApproval(data)');
        }
    });

    test('old onchain tool handlers and declarations are gone', () => {
        expect(read('src/features/ai/ai-onchain.js')).not.toMatch(/smartCopyTools/);
        expect(read('src/features/ai/onchain/marketTools.js')).not.toMatch(/manage_auto_trading|manage_copy_trading|copyTrading|autoTrading/);
        expect(read('src/features/ai/onchain/declarations.js')).not.toMatch(/manage_auto_trading|manage_copy_trading|name: 'smart_copy'/);
        expect(read('src/app/coreCommands.js')).not.toMatch(/copy\|(?:yes|no|unfollow)\||features\/copyTrading/);
    });

    test('legacy SKUs and runtime configuration are removed', () => {
        expect(read('src/services/x402PaymentService.js')).not.toMatch(/['"](?:auto_trading|copy_trading)['"]/);
        expect(read('.env.example')).not.toMatch(/^(?:OKXAI|OKX_AI|AGENT_RUNTIME)_[A-Z0-9_]+=/m);
        expect(read('.env.example')).not.toMatch(/^(?:AI_ROUTER_DEFAULT_PROVIDER|AI_ROUTER_ALLOW_USER_KEYS|AI_ROUTER_USER_KEYS_SECRET|AI_ROUTER_USER_KEYS_FILE|OPENROUTER_API_KEY|OPENROUTER_BASE_URL|OPENROUTER_MODEL)=/m);
        expect(read('.env.example')).toContain('DEFAULT_AI_PROVIDER=9router');
        expect(read('src/services/aiRouter/providers.js')).toContain('Boolean(NINEROUTER_CHAT_COMPLETIONS_URL)');
    });

    test('OnchainOS never falls back to repository-embedded credentials', () => {
        const service = read('src/services/onchainos.js');
        expect(service).not.toMatch(/SANDBOX_(?:API_KEY|SECRET_KEY|PASSPHRASE)/);
        expect(service).toMatch(/ONCHAINOS_CREDENTIALS_REQUIRED/);
    });

    test('dashboard catalog and translations do not advertise removed pages', () => {
        expect(read('dashboard/xBot/src/pages/LandingPage.jsx')).not.toMatch(/pageAiTraderDesc|pageSmartCopyDesc|AI Trader|Smart Copy/);
        expect(read('dashboard/xBot/src/i18n/index.js')).not.toMatch(/smartCopyPage|aiTraderPage|pageAiTraderDesc|pageSmartCopyDesc|suggestCopy|suggestAutoTrading/);
    });

    test('Chat AI exposes one 9Router connection and never collects or sends upstream credentials', () => {
        const chatPage = read('dashboard/xBot/src/pages/user/ChatPage.jsx');
        const settingsPage = read('dashboard/xBot/src/pages/user/SettingsPage.jsx');
        const apiClient = read('dashboard/xBot/src/api/client.js');
        const chatRoutes = read('src/server/chatRoutes.js');

        expect(chatPage).not.toMatch(/setApiKeyProvider|PROVIDER_OPTIONS/);
        expect(settingsPage).not.toMatch(/PROVIDER_OPTIONS|provider:\s*['"]google['"]|API Keys are now in the Chat page/);
        expect(chatPage).not.toMatch(/loadApiKeys/);
        expect(chatPage).not.toMatch(/xbot_ai_api_keys|apiKeyInput|API Keys Tab|value:\s*['"](?:google|openai|groq)['"]/i);
        expect(chatPage).toMatch(/const stopGenerating = \(\) => \{[\s\S]*?abortRef\.current\?\.abort\(\)/);
        expect(chatPage).not.toContain("content: `\\u274c ${err.message");
        expect(apiClient).toContain('AI stream ended unexpectedly. Please try again.');
        expect(apiClient).not.toMatch(/userApiKey/);
        expect(chatRoutes).not.toMatch(/resolve(?:Gemini|OpenAI|Groq|NineRouter)Key|userApiKey/);
        expect(chatPage).toContain("provider: '9router'");
    });

    test('ONE Connect lifecycle is owner-only, feature-gated, and never accepts secrets from dashboard payloads', () => {
        const dashboardRoutes = read('src/server/dashboardRoutes.js');
        const apiClient = read('dashboard/xBot/src/api/client.js');
        const configPage = read('dashboard/xBot/src/pages/owner/ConfigPage.jsx');
        const apiServer = read('src/server/apiServer.js');
        const envExample = read('.env.example');

        expect(envExample).toContain('ROUTER_ENABLED=false');
        expect(envExample).toContain('ROUTER_URL=http://localhost:20128');
        expect(envExample).toContain('ROUTER_SECRET=');
        expect(envExample).toContain('ROUTER_MODEL=plan');
        expect(envExample).not.toMatch(/NINEROUTER_(?:BASE_URL|INTERNAL_URL|TENANT_SECRET|API_KEY|SERVICE_TOKEN|MODEL)|CHAT_ORCHESTRATOR_/);
        expect(dashboardRoutes).toMatch(/router\.get\('\/owner\/config\/one-connect', ownerGuard/);
        expect(dashboardRoutes).toMatch(/router\.post\('\/owner\/config\/one-connect\/connect', ownerGuard/);
        expect(dashboardRoutes).toMatch(/router\.post\('\/owner\/config\/one-connect\/disconnect', ownerGuard/);
        expect(dashboardRoutes).not.toMatch(/req\.body[^\n]*(serviceToken|apiKey|credential)/i);
        expect(apiClient).toMatch(/getOneConnectStatus\(\)/);
        expect(apiClient).toMatch(/connectOneConnect\(\)/);
        expect(apiClient).toMatch(/disconnectOneConnect\(\)/);
        expect(configPage).toMatch(/ONE Connect/);
        expect(configPage).not.toMatch(/type=["']password["']/);
        const tenantChatRoutes = read('src/server/chatRoutes.js');
        expect(tenantChatRoutes).toMatch(/createTenantHeaders/);
        expect(tenantChatRoutes).toMatch(/const tenantId = normalizeTenantId\(userId\)/);
        expect(tenantChatRoutes).toMatch(/\{\s*tenantId,\s*userId:\s*tenantId\s*\}/);
        expect(tenantChatRoutes).not.toMatch(/req\.(?:body|query|headers)[^\n]*tenantId/);
        expect(tenantChatRoutes).not.toMatch(/nineRouterRuntime\.recordUsage/);
        const readinessRoute = apiServer.slice(apiServer.indexOf("app.get('/readyz'"), apiServer.indexOf("app.get('/metrics'"));
        expect(readinessRoute).not.toMatch(/usage|activeRequests|connectedAt/);
    });

    test('every dashboard chat surface explicitly selects 9Router and records terminal engine provenance', () => {
        for (const relativePath of [
            'dashboard/xBot/src/pages/user/ChatPage.jsx',
            'dashboard/xBot/src/components/ChatWidget.jsx',
            'dashboard/xBot/src/components/chat/FloatingChat.jsx'
        ]) {
            const source = read(relativePath);
            expect(source).toContain("provider: '9router'");
            expect(source).toMatch(/engine/);
        }
    });

    test('every dashboard chat surface renders non-secret 9Router engine provenance', () => {
        for (const relativePath of [
            'dashboard/xBot/src/pages/user/ChatPage.jsx',
            'dashboard/xBot/src/components/ChatWidget.jsx',
            'dashboard/xBot/src/components/chat/FloatingChat.jsx'
        ]) {
            const source = read(relativePath);
            expect(source).toContain('Routed by 9Router');
            expect(source).toMatch(/\.engine/);
        }
    });

    test('every dashboard chat surface escapes model HTML and allowlists link protocols', () => {
        for (const relativePath of [
            'dashboard/xBot/src/pages/user/ChatPage.jsx',
            'dashboard/xBot/src/components/ChatWidget.jsx',
            'dashboard/xBot/src/components/chat/FloatingChat.jsx'
        ]) {
            const source = read(relativePath);
            expect(source).toContain(".replace(/</g, '&lt;')");
            expect(source).toContain('/^https?:\\/\\//i.test(url)');
        }
    });

    test('Telegram 9Router chat uses the shared tenant runtime without provider key pools or direct fallback', () => {
        const aiHandlers = read('src/app/aiHandlers.js');
        const aiCommand = read('src/commands/ai.js');
        const callbackWiring = read('index.js');
        const tenantRuntime = read('src/services/nineRouterTenantChat.js');
        const aiService = read('src/features/aiService.js');
        const apiHandlers = read('src/app/aiApiHandlers.js');

        expect(aiHandlers).toContain("require('../services/nineRouterTenantChat')");
        expect(aiHandlers).toMatch(/completeTenantChat\(\{[\s\S]*?userId,[\s\S]*?messages/);
        expect(aiHandlers).toMatch(/if \(!hasAudio\) \{[\s\S]*?provider: '9router'/);
        expect(aiHandlers).toMatch(/classifyTenantChatError\(error\)/);
        expect(aiHandlers).not.toMatch(/nineRouterUserKeys|9router-local|NINEROUTER_ALLOW_NO_KEY/);
        expect(aiHandlers).not.toMatch(/NINEROUTER_API_KEY|NINEROUTER_CHAT_COMPLETIONS_URL/);
        expect(aiHandlers).not.toMatch(/axios\.post\([\s\S]{0,300}9Router/i);
        expect(aiHandlers).not.toMatch(/availableProviders\.push\('9router'\)/);
        expect(aiCommand).not.toMatch(/nineRouterUserKeys|NINEROUTER_API_KEY|NINEROUTER_ALLOW_NO_KEY/);
        expect(callbackWiring).not.toMatch(/nineRouterUserKeys/);
        expect(tenantRuntime).toMatch(/canonicalTenantIdentity\(userId\)/);
        expect(tenantRuntime).toMatch(/discoverTenantModels\(\{ userId/);
        expect(aiService).toMatch(/supportsApiKeys: false/);
        expect(aiService).not.toMatch(/Send your 9Router API key|9Router API key if/);
        expect(apiHandlers).toMatch(/meta\.supportsApiKeys === false/);
    });

    test('dashboard and management gateway never expose raw 9Router errors', () => {
        const chatPage = read('dashboard/xBot/src/pages/user/ChatPage.jsx');
        const settings = read('dashboard/xBot/src/components/chat/NineRouterSettings.jsx');
        const tenantRoutes = read('src/server/nineRouterTenantRoutes.js');

        expect(chatPage).not.toMatch(/sanitized\.substring|Please contact the xBot administrator/);
        expect(settings).not.toMatch(/setError\(err\.message\)/);
        expect(tenantRoutes).not.toMatch(/upstream\?\.(?:error|message)/);
        expect(tenantRoutes).toContain("'NINEROUTER_UNAVAILABLE'");
    });

    test('tenant sidecar persistence resolves adapters and backups from mandatory tenant context', () => {
        const driver = read('services/nine-router-sidecar/src/lib/db/driver.js');
        const backups = read('services/nine-router-sidecar/src/lib/db/backup.js');
        const migration = read('services/nine-router-sidecar/src/lib/db/migrate.js');

        expect(driver).toMatch(/const tenantId = getTenantId\(\)/);
        expect(driver).toMatch(/getTenantDataFile\(tenantId\)/);
        expect(backups).toMatch(/getTenantBackupsDir\(tenantId\)/);
        expect(migration).toMatch(/const hasLegacy = !tenantMode/);

        const compose = read('services/nine-router-sidecar/docker-compose.yml');
        const dockerfile = read('services/nine-router-sidecar/Dockerfile');
        expect(compose).toMatch(/build:\s*\n\s*context: \./);
        expect(compose).not.toContain('decolua/9router:latest');
        expect(dockerfile).toContain('CMD ["node", "custom-server.js"]');
    });

    test('model discovery and paid inference are fail-closed through 9Router only', () => {
        const chatRoutes = read('src/server/chatRoutes.js');
        const env = read('src/config/env.js');
        expect(chatRoutes).toMatch(/router\.get\('\/models'/);
        expect(chatRoutes).not.toMatch(/new GoogleGenAI|new OpenAI/);
        expect(chatRoutes).not.toMatch(/detectProviderFromModel/);
        expect(chatRoutes).toMatch(/createChatOrchestrator/);
        expect(chatRoutes).toContain('baseUrl: getTenantApiRoot()');
        expect(chatRoutes).toMatch(/buildHeaders:\s*\(identity, request\)\s*=>\s*createTenantHeaders/);
        expect(chatRoutes).toMatch(/availableModelIds\.includes\(chosenModel\)/);
        expect(chatRoutes).toContain('configured: true');
        expect(env).toMatch(/const NINEROUTER_MODEL = \(process\.env\.ROUTER_MODEL \|\| ''\)\.trim\(\)/);
        const tenantClient = read('src/services/nineRouterTenantClient.js');
        expect(tenantClient).toMatch(/createHmac\('sha256', secret\)/);
        expect(tenantClient).toMatch(/normalizeTenantId\(tenantId\)/);
    });

    test('combo members are authoritative discovered model IDs, not provider connection IDs', () => {
        const settings = read('dashboard/xBot/src/components/chat/NineRouterSettings.jsx');
        expect(settings).toContain("api.request('/ai/models'");
        expect(settings).toMatch(/models:\s*selected/);
        expect(settings).toMatch(/modelOptions\.map\(model/);
        expect(settings).not.toMatch(/selected\.includes\(connection\.id\)/);
    });

    test('Chat AI can add and test a tenant-scoped OpenAI-compatible endpoint through existing 9Router APIs', () => {
        const settings = read('dashboard/xBot/src/components/chat/NineRouterSettings.jsx');
        const tenantClient = read('src/services/nineRouterTenantClient.js');

        expect(settings).toContain("api9r('/provider-nodes/validate'");
        expect(settings).toContain("api9r('/provider-nodes'");
        expect(settings).toMatch(/provider\s*=\s*nodeResult\?\.node\?\.id/);
        expect(settings).toMatch(/baseUrl/);
        expect(settings).toMatch(/apiType/);
        expect(settings).toMatch(/type=["']password["']/);
        expect(settings).not.toMatch(/localStorage[^\n]*(?:apiKey|credential|token)/i);
        expect(tenantClient).toMatch(/api\\\/provider-nodes/);
        expect(tenantClient).toMatch(/api\\\/providers/);
    });

    test('Chat AI exposes authoritative tenant-scoped device login without persisting OAuth credentials in the browser', () => {
        const settings = read('dashboard/xBot/src/components/chat/NineRouterSettings.jsx');
        const catalogRoute = read('services/nine-router-sidecar/src/app/api/providers/catalog/route.js');
        const tenantClient = read('src/services/nineRouterTenantClient.js');

        expect(catalogRoute).toMatch(/buildTenantProviderCatalog/);
        const providerCatalog = read('services/nine-router-sidecar/src/lib/providerCatalog.js');
        expect(providerCatalog).toMatch(/import REGISTRY/);
        expect(providerCatalog).toMatch(/flowType\s*===\s*["']device_code["']/);
        expect(`${catalogRoute}\n${providerCatalog}`).not.toMatch(/\b(?:accessToken|refreshToken|apiKey)\s*:/);
        expect(settings).toContain("api9r('/providers/catalog'");
        expect(settings).toMatch(/api9r\(`\/oauth\/\$\{[^}]+\}\/device-code`/);
        expect(settings).toMatch(/api9r\(`\/oauth\/\$\{[^}]+\}\/poll`/);
        expect(settings).toMatch(/verification_uri_complete\s*\|\|\s*[^;]*verification_uri/);
        expect(settings).toMatch(/\[['"]http:['"],\s*['"]https:['"]\]\.includes\(url\.protocol\)/);
        expect(settings).not.toMatch(/localStorage[^\n]*(?:deviceCode|codeVerifier|accessToken|refreshToken)/i);
        expect(tenantClient).toContain('(?:catalog|client|validate|test-batch)');
    });

    test('Chat AI has no fabricated model fallback and clears availability after discovery failure', () => {
        const chatPage = read('dashboard/xBot/src/pages/user/ChatPage.jsx');
        expect(chatPage).not.toMatch(/const FALLBACK_MODELS|MODEL_OPTIONS_BY_PROVIDER/);
        expect(chatPage).not.toMatch(/useState\(\(\) => \{[\s\S]{0,200}['"]xbot['"]/);
        expect(chatPage).toMatch(/catch\s*\{[\s\S]{0,250}setModelOptions\(\[\]\)[\s\S]{0,250}configured:\s*false/);
        expect(chatPage).toMatch(/disabled=\{[^}]*!modelMeta\.configured/);
    });

    test('Chat AI explains limited models and provides a direct provider connection flow', () => {
        const chatPage = read('dashboard/xBot/src/pages/user/ChatPage.jsx');
        const settings = read('dashboard/xBot/src/components/chat/NineRouterSettings.jsx');
        const providerIcon = read('dashboard/xBot/src/components/chat/providerIcon.js');

        expect(chatPage).toMatch(/modelOptions\.length\s*<\s*5/);
        expect(chatPage).toMatch(/modelsByUpstream\.map/);
        expect(chatPage).toMatch(/openProviderSettings/);
        expect(chatPage).toMatch(/connectedProviderCount/);
        expect(chatPage).toMatch(/providerHealthById/);
        expect(chatPage).toContain("gcli: 'grok-cli'");
        expect(chatPage).toMatch(/NineRouterSettings[^>]*initialSection=["']providers["']/);
        expect(settings).toMatch(/FEATURED_PROVIDER_IDS/);
        expect(providerIcon).toContain("gcli: 'grok-cli'");
        expect(settings).toContain("api9r('/providers/test-batch'");
        expect(settings).toMatch(/connectionHealth/);
        expect(settings).toMatch(/showMoreProviders/);
        expect(settings).toMatch(/One-click login|oneClickLogin/);
        expect(settings).toMatch(/Secure OAuth|secureOAuth/);
        expect(settings).toMatch(/Import credentials|importCredentials/);
        expect(settings).toMatch(/Free services|freeServices/);
        expect(chatPage).toContain("t('dashboard.chatPage.connected', 'Connected')");
        expect(chatPage).toContain("t('dashboard.chatPage.unavailable', 'Unavailable')");
        expect(settings).toContain("t('dashboard.chatPage.modelsAvailableShort', 'models available')");
    });

    test('dashboard exposes the high-impact upstream 9Router UX affordances', () => {
        const chatPage = read('dashboard/xBot/src/pages/user/ChatPage.jsx');
        const settings = read('dashboard/xBot/src/components/chat/NineRouterSettings.jsx');
        const tenantClient = read('src/services/nineRouterTenantClient.js');
        const i18n = read('dashboard/xBot/src/i18n/index.js');

        expect(settings).toMatch(/id:\s*'endpoint'/);
        expect(settings).toMatch(/function EndpointInfo/);
        expect(settings).toContain("'/api/ai/chat/stream'");
        expect(settings).toMatch(/navigator\.clipboard\.writeText\(endpointUrl\)/);
        expect(settings).toContain("/test-models");
        expect(settings).toMatch(/modelTestResults/);
        expect(settings).toMatch(/connection\.providerSpecificData\?\.chatgptPlanType/);
        expect(tenantClient).toMatch(/test-models/);

        expect(chatPage).toMatch(/modelSearch[\s\S]*model\.label[\s\S]*model\.id/);
        expect(chatPage).toMatch(/modelCapabilityBadges/);
        expect(chatPage).toContain("'xbot_ai_model'");
        expect(chatPage).toMatch(/selectedModelInfo/);

        expect(settings).toMatch(/comboCapabilities/);
        expect(settings).toMatch(/fallbackStrategy/);
        expect(settings).toMatch(/index \+ 1/);
        expect(i18n).toContain("nineRouter_endpoint: 'Endpoint'");
        expect(i18n).toContain("nineRouter_endpoint: 'Điểm cuối'");
        expect(i18n).toContain("testAllModels: 'Test all models'");
        expect(i18n).toContain("testAllModels: 'Kiểm tra tất cả model'");
    });
});