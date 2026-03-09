const crypto = require('crypto');
const logger = require('../core/logger');
const log = logger.child('OKX');
const { ethers } = require('ethers');
const {
    delay,
    decimalToRawBigInt,
    normalizeAddressSafe,
    normalizeNumeric,
    normalizeOkxConfigAddress,
    unwrapOkxData,
    unwrapOkxFirst
} = require('../utils/helpers');
const { parseBigIntValue } = require('../utils/format');
const {
    tokenDecimalsCache,
    okxTokenDirectoryCache,
    okxResolvedChainCache
} = require('../core/state');

function createOkxService(config) {
    const {
        OKX_BASE_URL,
        OKX_API_KEY,
        OKX_SECRET_KEY,
        OKX_API_PASSPHRASE,
        OKX_API_PROJECT,
        OKX_API_SIMULATED,
        OKX_FETCH_TIMEOUT,
        OKX_CHAIN_SHORT_NAME,
        OKX_CHAIN_INDEX,
        OKX_CHAIN_INDEX_FALLBACK,
        OKX_CHAIN_CONTEXT_TTL,
        OKX_BANMAO_TOKEN_ADDRESS,
        OKX_QUOTE_TOKEN_ADDRESS,
        OKX_OKB_TOKEN_ADDRESSES = [],
        OKX_OKB_SYMBOL_KEYS = [],
        OKX_MARKET_INSTRUMENT = null,
        BANMAO_DECIMALS_DEFAULT,
        BANMAO_DECIMALS_CACHE_TTL,
        PRICE_REF_OKB_ADDRESS = null,
        PRICE_REF_OKB_CHAIN_INDEX = null,
        PRICE_REF_ETH_ADDRESS = null,
        PRICE_REF_ETH_CHAIN_INDEX = null,
        PRICE_REF_BTC_ADDRESS = null,
        PRICE_REF_BTC_CHAIN_INDEX = 1,
        OKX_DEX_DEFAULT_MAX_RETRIES = 2,
        OKX_DEX_DEFAULT_RETRY_DELAY_MS = 400
    } = config;

    let okxChainDirectoryCache = null;
    let okxChainDirectoryExpiresAt = 0;
    let okxChainDirectoryPromise = null;
    let banmaoDecimalsCache = null;
    let banmaoDecimalsFetchedAt = 0;
    const BANMAO_ADDRESS_LOWER = OKX_BANMAO_TOKEN_ADDRESS ? OKX_BANMAO_TOKEN_ADDRESS.toLowerCase() : null;
    const OKX_QUOTE_ADDRESS_LOWER = OKX_QUOTE_TOKEN_ADDRESS ? OKX_QUOTE_TOKEN_ADDRESS.toLowerCase() : null;
    const REF_OKB_ADDRESS = PRICE_REF_OKB_ADDRESS
        || (Array.isArray(OKX_OKB_TOKEN_ADDRESSES) && OKX_OKB_TOKEN_ADDRESSES.length > 0
            ? OKX_OKB_TOKEN_ADDRESSES[0]
            : null);
    const REF_OKB_CHAIN = Number.isFinite(PRICE_REF_OKB_CHAIN_INDEX)
        ? PRICE_REF_OKB_CHAIN_INDEX
        : (Number.isFinite(OKX_CHAIN_INDEX) ? OKX_CHAIN_INDEX : OKX_CHAIN_INDEX_FALLBACK);
    const REF_ETH_ADDRESS = PRICE_REF_ETH_ADDRESS || null;
    const REF_ETH_CHAIN = Number.isFinite(PRICE_REF_ETH_CHAIN_INDEX)
        ? PRICE_REF_ETH_CHAIN_INDEX
        : (Number.isFinite(OKX_CHAIN_INDEX) ? OKX_CHAIN_INDEX : OKX_CHAIN_INDEX_FALLBACK);
    const REF_BTC_ADDRESS = PRICE_REF_BTC_ADDRESS || null;
    const REF_BTC_CHAIN = Number.isFinite(PRICE_REF_BTC_CHAIN_INDEX)
        ? PRICE_REF_BTC_CHAIN_INDEX
        : 1;

    const hasOkxCredentials = Boolean(OKX_API_KEY && OKX_SECRET_KEY && OKX_API_PASSPHRASE);

    function ensureQueryChainParams(query, options = {}) {
        if (!query || typeof query !== 'object') {
            return {};
        }

        const includeToken = options.includeToken !== false;
        const includeQuote = options.includeQuote !== false;

        if (!query.chainShortName) {
            query.chainShortName = OKX_CHAIN_SHORT_NAME || 'xlayer';
        }

        if (!Number.isFinite(query.chainIndex)) {
            if (Number.isFinite(OKX_CHAIN_INDEX)) {
                query.chainIndex = Number(OKX_CHAIN_INDEX);
            } else if (Number.isFinite(OKX_CHAIN_INDEX_FALLBACK)) {
                query.chainIndex = OKX_CHAIN_INDEX_FALLBACK;
            }
        }

        if (!Number.isFinite(query.chainId)) {
            if (Number.isFinite(query.chainIndex)) {
                query.chainId = Number(query.chainIndex);
            } else if (Number.isFinite(OKX_CHAIN_INDEX_FALLBACK)) {
                query.chainId = Number(OKX_CHAIN_INDEX_FALLBACK);
            }
        }

        if (includeToken && OKX_BANMAO_TOKEN_ADDRESS) {
            query.tokenAddress = OKX_BANMAO_TOKEN_ADDRESS;
            query.baseTokenAddress = query.baseTokenAddress || OKX_BANMAO_TOKEN_ADDRESS;
            query.baseCurrency = query.baseCurrency || OKX_BANMAO_TOKEN_ADDRESS;
            query.baseToken = query.baseToken || OKX_BANMAO_TOKEN_ADDRESS;
            query.tokenContractAddress = query.tokenContractAddress || OKX_BANMAO_TOKEN_ADDRESS;
        }

        if (includeQuote && OKX_QUOTE_TOKEN_ADDRESS) {
            query.quoteTokenAddress = OKX_QUOTE_TOKEN_ADDRESS;
            query.quoteCurrency = query.quoteCurrency || OKX_QUOTE_TOKEN_ADDRESS;
            query.quoteToken = query.quoteToken || OKX_QUOTE_TOKEN_ADDRESS;
            if (!query.toTokenAddress) {
                query.toTokenAddress = OKX_QUOTE_TOKEN_ADDRESS;
            }
        }

        return query;
    }

    async function okxJsonRequest(method, path, options = {}) {
        const { query, body, auth = hasOkxCredentials, expectOkCode = true } = options;
        const url = new URL(path, OKX_BASE_URL);

        if (query && typeof query === 'object') {
            for (const [key, value] of Object.entries(query)) {
                if (value === undefined || value === null || value === '') {
                    continue;
                }
                if (Array.isArray(value)) {
                    const filtered = value.filter((item) => item !== undefined && item !== null && item !== '');
                    if (filtered.length === 0) {
                        continue;
                    }
                    filtered.forEach((item) => url.searchParams.append(key, String(item)));
                    continue;
                }
                url.searchParams.set(key, String(value));
            }
        }

        const methodUpper = method.toUpperCase();
        const requestPath = url.pathname + url.search;
        const bodyString = body ? JSON.stringify(body) : '';

        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'banmao-bot/2.0 (+https://www.banmao.fun)'
        };

        if (bodyString) {
            headers['Content-Type'] = 'application/json';
        }

        if (auth && hasOkxCredentials) {
            const timestamp = new Date().toISOString();
            const signPayload = `${timestamp}${methodUpper}${requestPath}${bodyString}`;
            const signature = crypto
                .createHmac('sha256', OKX_SECRET_KEY)
                .update(signPayload)
                .digest('base64');

            headers['OK-ACCESS-KEY'] = OKX_API_KEY;
            headers['OK-ACCESS-SIGN'] = signature;
            headers['OK-ACCESS-TIMESTAMP'] = timestamp;
            headers['OK-ACCESS-PASSPHRASE'] = OKX_API_PASSPHRASE;
            if (OKX_API_PROJECT) {
                headers['OK-ACCESS-PROJECT'] = OKX_API_PROJECT;
            }
            if (OKX_API_SIMULATED) {
                headers['x-simulated-trading'] = '1';
            }
        }

        const response = await fetchJsonWithTimeout(url.toString(), {
            method: methodUpper,
            headers,
            body: bodyString || undefined
        }, OKX_FETCH_TIMEOUT);

        if (!response) {
            return null;
        }

        if (expectOkCode && response.code && response.code !== '0') {
            const msg = typeof response.msg === 'string' ? response.msg : 'Unknown error';
            throw new Error(`OKX response code ${response.code}: ${msg}`);
        }

        return response;
    }

    async function fetchJsonWithTimeout(urlString, requestOptions, timeoutMs) {
        const options = requestOptions || {};

        if (typeof fetch === 'function') {
            const supportsAbort = typeof AbortController === 'function';
            const controller = supportsAbort ? new AbortController() : null;
            let timeoutId = null;
            let timedOut = false;

            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    timedOut = true;
                    if (controller) {
                        controller.abort();
                    }
                    reject(new Error('Request timed out'));
                }, timeoutMs);
            });

            try {
                const response = await Promise.race([
                    fetch(urlString, {
                        ...options,
                        ...(controller ? { signal: controller.signal } : {})
                    }),
                    timeoutPromise
                ]);

                if (!response) {
                    throw new Error('Invalid response from fetch');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const text = await response.text();
                if (!text) {
                    return null;
                }

                try {
                    return JSON.parse(text);
                } catch (error) {
                    throw new Error('Failed to parse OKX response');
                }
            } catch (error) {
                if (timedOut || (controller && error && error.name === 'AbortError')) {
                    throw new Error('Request timed out');
                }
                throw error;
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            }
        }

        return await fetchJsonWithHttps(urlString, options, timeoutMs);
    }

    function fetchJsonWithHttps(urlString, options, timeoutMs) {
        return new Promise((resolve, reject) => {
            const requestOptions = {
                method: options.method || 'GET',
                headers: options.headers || {}
            };

            const req = require('https').request(urlString, requestOptions, (response) => {
                const { statusCode } = response;
                const chunks = [];

                response.setEncoding('utf8');
                response.on('error', reject);

                if (!statusCode || statusCode < 200 || statusCode >= 300) {
                    if (typeof response.resume === 'function') {
                        response.resume();
                    }
                    reject(new Error(`HTTP ${statusCode || 'ERR'}`));
                    return;
                }

                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    const body = chunks.join('');

                    if (!body) {
                        resolve(null);
                        return;
                    }

                    try {
                        resolve(JSON.parse(body));
                    } catch (error) {
                        reject(new Error('Failed to parse OKX response'));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error('Request timed out'));
            });

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }

    function isOkxMethodNotAllowedError(error) {
        if (!error || !error.message) {
            return false;
        }

        const message = String(error.message).toLowerCase();
        if (message.includes('http 405')) {
            return true;
        }
        if (message.includes("request method 'get' not supported") || message.includes("request method 'post' not supported")) {
            return true;
        }
        if (message.includes('method not allowed')) {
            return true;
        }

        return false;
    }

    function isOkxRateLimitError(error) {
        if (!error || !error.message) {
            return false;
        }

        const message = String(error.message).toLowerCase();
        return message.includes('http 429') || message.includes('too many requests') || message.includes('rate limit');
    }

    function isOkxTransientResponseError(error) {
        if (!error || !error.message) {
            return false;
        }

        const message = String(error.message).toLowerCase();
        if (message.includes('okx response code -1')) {
            return true;
        }
        if (message.includes('timed out') || message.includes('etimedout')) {
            return true;
        }
        return false;
    }

    function isOkxRetryableError(error) {
        return isOkxRateLimitError(error) || isOkxTransientResponseError(error);
    }

    async function callOkxDexEndpoint(path, query, options = {}) {
        const {
            method = 'GET',
            auth = hasOkxCredentials,
            allowFallback = true,
            bodyType = null,
            maxRetries = OKX_DEX_DEFAULT_MAX_RETRIES,
            retryDelayMs = OKX_DEX_DEFAULT_RETRY_DELAY_MS
        } = options;

        const resolvedMaxRetries = Number.isFinite(Number(maxRetries))
            ? Math.max(0, Math.floor(Number(maxRetries)))
            : OKX_DEX_DEFAULT_MAX_RETRIES;
        const resolvedRetryDelayMs = Number.isFinite(Number(retryDelayMs))
            ? Math.max(0, Math.floor(Number(retryDelayMs)))
            : OKX_DEX_DEFAULT_RETRY_DELAY_MS;

        const preferredMethod = (method || 'GET').toUpperCase();
        const fallbackMethod = preferredMethod === 'POST' ? 'GET' : 'POST';
        const methods = allowFallback && fallbackMethod !== preferredMethod
            ? [preferredMethod, fallbackMethod]
            : [preferredMethod];

        let lastError = null;

        for (const currentMethod of methods) {
            for (let attempt = 0; attempt <= resolvedMaxRetries; attempt += 1) {
                try {
                    const requestBody = bodyType === 'array' && currentMethod !== 'GET'
                        ? Array.isArray(query)
                            ? query
                            : query
                                ? [query]
                                : []
                        : query;

                    const requestOptions = currentMethod === 'GET'
                        ? { query, auth }
                        : { body: requestBody, auth };

                    return await okxJsonRequest(currentMethod, path, requestOptions);
                } catch (error) {
                    const methodNotAllowed = isOkxMethodNotAllowedError(error);
                    const canRetry = !methodNotAllowed && attempt < resolvedMaxRetries && isOkxRetryableError(error);

                    if (canRetry) {
                        const backoff = resolvedRetryDelayMs * Math.max(1, attempt + 1);
                        if (backoff > 0) {
                            await delay(backoff);
                        }
                        continue;
                    }

                    lastError = error;
                    if (!allowFallback || !methodNotAllowed) {
                        throw error;
                    }

                    break;
                }
            }
        }

        if (lastError) {
            throw lastError;
        }

        return null;
    }

    function normalizeChainKey(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        return trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // Backward-compatible alias for earlier helper name references.
    function normalizeOkxChainEntry(entry) {
        return normalizeOkxChainDirectoryEntry(entry);
    }

    function normalizeOkxChainDirectoryEntry(entry) {
        if (!entry) {
            return null;
        }

        if (typeof entry === 'string') {
            const trimmed = entry.trim();
            if (!trimmed) {
                return null;
            }

            const key = normalizeChainKey(trimmed);
            return {
                chainShortName: trimmed,
                chainName: trimmed,
                chainIndex: null,
                chainId: null,
                aliases: [trimmed],
                keys: key ? [key] : [],
                primaryKey: key,
                raw: entry
            };
        }

        if (typeof entry !== 'object') {
            return null;
        }

        const aliasFields = [
            entry.chainShortName,
            entry.chainName,
            entry.chain,
            entry.name,
            entry.shortName,
            entry.short_name,
            entry.short,
            entry.symbol,
            entry.chainSymbol,
            entry.chainAlias,
            entry.alias,
            entry.displayName,
            entry.label,
            entry.networkName
        ];

        const aliases = Array.from(new Set(aliasFields
            .map((value) => (typeof value === 'string' ? value.trim() : null))
            .filter(Boolean)));

        const chainShortName = aliases[0] || null;
        const chainName = (typeof entry.chainName === 'string' && entry.chainName.trim())
            ? entry.chainName.trim()
            : (aliases[1] || chainShortName || null);

        const chainIndexCandidate = entry.chainIndex ?? entry.index ?? entry.chain_id ?? entry.chainId ?? entry.id;
        const chainIdCandidate = entry.chainId ?? entry.chain_id ?? entry.chainID ?? entry.id ?? entry.networkId;

        const chainIndexNumeric = normalizeNumeric(chainIndexCandidate);
        const chainIdNumeric = normalizeNumeric(chainIdCandidate);

        const chainIndex = Number.isFinite(chainIndexNumeric) ? Math.trunc(chainIndexNumeric) : null;
        const chainId = Number.isFinite(chainIdNumeric) ? Math.trunc(chainIdNumeric) : null;

        const keys = Array.from(new Set(aliases
            .map((alias) => normalizeChainKey(alias))
            .filter(Boolean)));

        const primaryKey = keys[0] || (Number.isFinite(chainIndex) ? `idx:${chainIndex}` : null);

        return {
            chainShortName: chainShortName || chainName || null,
            chainName: chainName || chainShortName || null,
            chainIndex,
            chainId,
            aliases,
            keys,
            primaryKey,
            raw: entry
        };
    }

    function dedupeOkxChainEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return [];
        }

        const seen = new Set();
        const result = [];

        for (const entry of entries) {
            if (!entry) {
                continue;
            }

            const key = entry.primaryKey
                || (Number.isFinite(entry.chainIndex) ? `idx:${entry.chainIndex}` : null)
                || (entry.chainShortName ? normalizeChainKey(entry.chainShortName) : null);

            if (key && seen.has(key)) {
                continue;
            }

            if (key) {
                seen.add(key);
            }

            result.push(entry);
        }

        return result;
    }

    function getChainDirectoryCache() {
        return {
            okxChainDirectoryCache,
            okxChainDirectoryExpiresAt,
            okxChainDirectoryPromise
        };
    }

    function setChainDirectoryCache(cacheValue, expiresAt, promise = null) {
        okxChainDirectoryCache = cacheValue;
        okxChainDirectoryExpiresAt = expiresAt;
        okxChainDirectoryPromise = promise;
    }

    async function ensureOkxChainDirectory() {
        const now = Date.now();
        const { okxChainDirectoryCache, okxChainDirectoryExpiresAt, okxChainDirectoryPromise } = getChainDirectoryCache();
        if (okxChainDirectoryCache && okxChainDirectoryExpiresAt > now) {
            return okxChainDirectoryCache;
        }

        if (okxChainDirectoryPromise) {
            return okxChainDirectoryPromise;
        }

        const promise = loadOkxChainDirectory()
            .then((directory) => {
                setChainDirectoryCache(directory, Date.now() + OKX_CHAIN_CONTEXT_TTL, null);
                return directory;
            })
            .catch((error) => {
                setChainDirectoryCache(null, 0, null);
                throw error;
            });

        setChainDirectoryCache(okxChainDirectoryCache, okxChainDirectoryExpiresAt, promise);
        return promise;
    }

    async function loadOkxChainDirectory() {
        const [aggregator, market, balance] = await Promise.allSettled([
            okxJsonRequest('GET', '/api/v6/dex/aggregator/supported/chain', { query: {}, expectOkCode: false }),
            okxJsonRequest('GET', '/api/v6/dex/market/supported/chain', { query: {}, expectOkCode: false }),
            okxJsonRequest('GET', '/api/v6/dex/balance/supported/chain', { query: {}, expectOkCode: false })
        ]);

        const normalizeList = (payload) => {
            const rawList = payload.status === 'fulfilled' ? unwrapOkxData(payload.value) : [];
            const normalized = [];
            for (const item of rawList || []) {
                const entry = normalizeOkxChainDirectoryEntry(item);
                if (entry) {
                    normalized.push(entry);
                }
            }
            return dedupeOkxChainEntries(normalized);
        };

        return {
            aggregator: normalizeList(aggregator),
            market: normalizeList(market),
            balance: normalizeList(balance)
        };
    }

    function findChainEntryByIndex(list, index) {
        if (!Array.isArray(list) || !Number.isFinite(index)) {
            return null;
        }

        const numericIndex = Number(index);
        for (const entry of list) {
            if (!entry) {
                continue;
            }

            if (Number.isFinite(entry.chainIndex) && Number(entry.chainIndex) === numericIndex) {
                return entry;
            }
        }

        return null;
    }

    function findChainEntryByKeys(list, keys) {
        if (!Array.isArray(list) || !Array.isArray(keys) || keys.length === 0) {
            return null;
        }

        for (const entry of list) {
            if (!entry || !Array.isArray(entry.keys)) {
                continue;
            }

            for (const key of entry.keys) {
                if (keys.includes(key)) {
                    return entry;
                }
            }
        }

        return null;
    }

    function collectChainSearchKeys(chainName) {
        const names = [];

        if (chainName) {
            names.push(chainName);
        }

        if (OKX_CHAIN_SHORT_NAME) {
            names.push(OKX_CHAIN_SHORT_NAME);
        }

        const configured = typeof OKX_CHAIN_SHORT_NAME === 'string'
            ? OKX_CHAIN_SHORT_NAME.split(/[|,]+/)
            : [];

        for (const value of configured) {
            names.push(value);
        }

        names.push('x-layer', 'xlayer', 'X Layer', 'okx xlayer', 'okbchain', 'okxchain');

        const normalized = [];
        const seen = new Set();

        for (const name of names) {
            if (!name || typeof name !== 'string') {
                continue;
            }

            const variants = [
                name,
                name.replace(/[_\\s-]+/g, ''),
                name.replace(/[_\\s]+/g, '-'),
                name.replace(/[-]+/g, ' ')
            ];

            for (const variant of variants) {
                const key = normalizeChainKey(variant);
                if (key && !seen.has(key)) {
                    seen.add(key);
                    normalized.push(key);
                }
            }
        }

        return normalized;
    }

    function getOkxChainShortNameCandidates() {
        const configured = typeof OKX_CHAIN_SHORT_NAME === 'string'
            ? OKX_CHAIN_SHORT_NAME.split(/[|,]+/)
            : [];

        const defaults = [
            'x-layer',
            'xlayer',
            'X Layer',
            'X-Layer',
            'X_LAYER',
            'Xlayer'
        ];

        const result = [];
        const seen = new Set();

        for (const value of [...configured, ...defaults]) {
            if (!value || typeof value !== 'string') {
                continue;
            }
            const trimmed = value.trim();
            if (!trimmed) {
                continue;
            }
            const key = normalizeChainKey(trimmed);
            if (key && !seen.has(key)) {
                seen.add(key);
                result.push(trimmed);
            }
        }

        if (result.length === 0) {
            result.push('x-layer');
        }

        return result;
    }

    async function resolveOkxChainContext(chainName) {
        const cacheKey = chainName ? chainName.toLowerCase().trim() : '(default)';
        const cached = okxResolvedChainCache.get(cacheKey);
        const now = Date.now();

        if (cached && cached.expiresAt > now) {
            return cached.value;
        }

        let directory = null;
        try {
            directory = await ensureOkxChainDirectory();
        } catch (error) {
            log.warn(`Failed to load chain directory: ${error.message}`);
        }

        const aggregator = directory?.aggregator || [];
        const market = directory?.market || [];

        const searchKeys = collectChainSearchKeys(chainName);

        let match = null;

        if (Number.isFinite(OKX_CHAIN_INDEX)) {
            match = findChainEntryByIndex(aggregator, OKX_CHAIN_INDEX)
                || findChainEntryByIndex(market, OKX_CHAIN_INDEX);
        }

        if (!match && searchKeys.length > 0) {
            match = findChainEntryByKeys(aggregator, searchKeys)
                || findChainEntryByKeys(market, searchKeys);
        }

        if (!match) {
            const xlayerKey = 'xlayer';
            match = findChainEntryByKeys(aggregator, [xlayerKey])
                || findChainEntryByKeys(market, [xlayerKey]);
        }

        if (!match) {
            match = aggregator[0] || market[0] || null;
        }

        if (!match) {
            const fallbackShortName = OKX_CHAIN_SHORT_NAME || 'xlayer';
            const fallbackKeys = collectChainSearchKeys(fallbackShortName);
            match = {
                chainShortName: fallbackShortName,
                chainName: fallbackShortName,
                chainIndex: Number.isFinite(OKX_CHAIN_INDEX)
                    ? Number(OKX_CHAIN_INDEX)
                    : OKX_CHAIN_INDEX_FALLBACK,
                chainId: null,
                aliases: [fallbackShortName],
                keys: fallbackKeys,
                primaryKey: fallbackKeys[0] || null,
                raw: null
            };
        }

        if (okxResolvedChainCache.size > 50) {
            okxResolvedChainCache.clear();
        }

        okxResolvedChainCache.set(cacheKey, {
            value: match,
            expiresAt: now + OKX_CHAIN_CONTEXT_TTL
        });

        return match;
    }

    function resolveChainContextShortName(context) {
        if (context && typeof context === 'object') {
            const aliasCandidates = [context.chainShortName, context.chainName, ...(context.aliases || [])]
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter(Boolean);
            if (aliasCandidates.length > 0) {
                return aliasCandidates[0];
            }
        }

        const candidates = getOkxChainShortNameCandidates();
        return candidates.length > 0 ? candidates[0] : 'xlayer';
    }

    async function buildOkxDexQuery(chainName, options = {}) {
        const query = {};
        const context = await resolveOkxChainContext(chainName);
        const explicitChainIndex = options.explicitChainIndex;
        const explicitChainShortName = options.explicitChainShortName;

        if (explicitChainShortName) {
            query.chainShortName = explicitChainShortName;
        }

        if (Number.isFinite(explicitChainIndex)) {
            query.chainIndex = Number(explicitChainIndex);
        }

        if (context) {
            if (!query.chainShortName) {
                if (context.chainShortName) {
                    query.chainShortName = context.chainShortName;
                } else if (chainName) {
                    query.chainShortName = chainName;
                }
            }

            if (!Number.isFinite(query.chainIndex)) {
                if (Number.isFinite(context.chainIndex)) {
                    query.chainIndex = Number(context.chainIndex);
                } else if (Number.isFinite(OKX_CHAIN_INDEX)) {
                    query.chainIndex = Number(OKX_CHAIN_INDEX);
                }
            }

            if (Number.isFinite(context.chainId)) {
                query.chainId = context.chainId;
            }
        } else if (chainName && !query.chainShortName) {
            query.chainShortName = chainName;
        }

        if (!query.chainShortName) {
            query.chainShortName = OKX_CHAIN_SHORT_NAME || 'xlayer';
        }

        if (!Number.isFinite(query.chainIndex)) {
            if (Number.isFinite(OKX_CHAIN_INDEX)) {
                query.chainIndex = Number(OKX_CHAIN_INDEX);
            } else if (Number.isFinite(OKX_CHAIN_INDEX_FALLBACK)) {
                query.chainIndex = OKX_CHAIN_INDEX_FALLBACK;
            }
        }

        if (!Number.isFinite(query.chainId)) {
            if (Number.isFinite(query.chainIndex)) {
                query.chainId = Number(query.chainIndex);
            } else if (Number.isFinite(OKX_CHAIN_INDEX_FALLBACK)) {
                query.chainId = Number(OKX_CHAIN_INDEX_FALLBACK);
            }
        }

        return ensureQueryChainParams(query, options);
    }

    async function collectTxhashChainEntries() {
        const directory = await ensureOkxChainDirectory();
        const combined = dedupeOkxChainEntries([
            ...(directory?.aggregator || []),
            ...(directory?.market || []),
            ...(directory?.balance || [])
        ]);
        return combined.filter(Boolean);
    }

    function sortTxhashChainEntries(entries = []) {
        return [...entries].sort((a, b) => {
            const ai = Number.isFinite(a?.chainIndex) ? Number(a.chainIndex) : Infinity;
            const bi = Number.isFinite(b?.chainIndex) ? Number(b.chainIndex) : Infinity;
            if (ai !== bi) {
                return ai - bi;
            }
            const an = a?.chainShortName || a?.chainName || '';
            const bn = b?.chainShortName || b?.chainName || '';
            return an.localeCompare(bn);
        });
    }

    function normalizeDexHolding(row) {
        if (!row) {
            return null;
        }

        const firstBalance = row.rawBalance
            ?? row.balance
            ?? row.tokenBalance
            ?? row.amount
            ?? row.holdingAmount
            ?? row.holding
            ?? row.tokenAmount;
        const rawBalance = firstBalance;
        const tokenAddressRaw = row.tokenContractAddress || row.tokenAddress || row.contractAddress || row.tokenAddr;
        let tokenAddress = normalizeOkxConfigAddress(tokenAddressRaw);

        const decimals = Number(row.decimals || row.decimal || row.tokenDecimal || row.tokenDecimals || row.tokenPrecision);
        const symbol = row.tokenSymbol || row.symbol;
        const name = row.tokenName || row.name;

        let amountRaw = null;
        if (rawBalance !== undefined && rawBalance !== null) {
            try {
                amountRaw = BigInt(rawBalance);
            } catch (error) {
                amountRaw = null;
            }
        }

        if (amountRaw === null && row.coinAmount !== undefined && row.coinAmount !== null) {
            const decimalsForDecimal = Number.isFinite(decimals) ? decimals : 18;
            amountRaw = decimalToRawBigInt(row.coinAmount, decimalsForDecimal);
        }

        if (amountRaw === null && firstBalance !== undefined && firstBalance !== null) {
            const decimalsForDecimal = Number.isFinite(decimals) ? decimals : 18;
            amountRaw = decimalToRawBigInt(firstBalance, decimalsForDecimal);
        }

        if (amountRaw === null && row.balance) {
            const decimalsForDecimal = Number.isFinite(decimals) ? decimals : 18;
            amountRaw = decimalToRawBigInt(row.balance, decimalsForDecimal);
        }

        if (!tokenAddress) {
            const chainId = row.chainIndex || row.chainId || row.chain || 'unknown';
            const symbolKey = (symbol || name || 'token').toString().toLowerCase().replace(/[^a-z0-9]+/gi, '-');
            tokenAddress = `native:${chainId}:${symbolKey || 'token'}`;
        }

        const currencyAmount = Number(row.currencyAmount);
        const tokenPriceRaw = row.tokenPrice !== undefined && row.tokenPrice !== null
            ? String(row.tokenPrice)
            : null;
        let priceUsd = Number.isFinite(Number(row.tokenUnitPrice || row.priceUsd || row.usdPrice || tokenPriceRaw))
            ? Number(row.tokenUnitPrice || row.priceUsd || row.usdPrice || tokenPriceRaw)
            : null;

        if ((!Number.isFinite(priceUsd) || priceUsd === null) && amountRaw !== null && Number.isFinite(decimals) && Number.isFinite(currencyAmount) && currencyAmount > 0) {
            try {
                const amountNumeric = Number(ethers.formatUnits(amountRaw, decimals));
                if (Number.isFinite(amountNumeric) && amountNumeric > 0) {
                    priceUsd = currencyAmount / amountNumeric;
                }
            } catch (error) {
                // ignore price derivation errors
            }
        }

        const balanceText = row.balance ?? row.coinAmount ?? null;

        return {
            tokenAddress,
            decimals: Number.isFinite(decimals) ? decimals : undefined,
            symbol,
            name,
            rawBalance,
            balance: balanceText,
            amountRaw,
            currencyAmount: Number.isFinite(currencyAmount) ? currencyAmount : null,
            priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
            tokenPrice: tokenPriceRaw,
            chainIndex: row.chainIndex || row.chainId || row.chain || row.chain_id,
            walletAddress: row.address || row.walletAddress,
            isRiskToken: Boolean(row.isRiskToken)
        };
    }

    function extractDexHoldingRows(payload) {
        const rows = [];
        if (!payload || typeof payload !== 'object') {
            return rows;
        }

        const direct = unwrapOkxData(payload);
        if (Array.isArray(direct)) {
            for (const item of direct) {
                if (!item) {
                    continue;
                }
                if (Array.isArray(item.tokenBalance)) {
                    rows.push(...item.tokenBalance);
                }
                if (Array.isArray(item.tokenBalances)) {
                    rows.push(...item.tokenBalances);
                }
                if (Array.isArray(item.tokenAssets)) {
                    rows.push(...item.tokenAssets);
                }
                if (Array.isArray(item.balanceList)) {
                    rows.push(...item.balanceList);
                }
                if (Array.isArray(item.balances)) {
                    rows.push(...item.balances);
                }
                if (Array.isArray(item.list)) {
                    rows.push(...item.list);
                }
                rows.push(item);
            }
        }

        const nested = payload.data && typeof payload.data === 'object' ? payload.data : null;
        if (nested) {
            const candidates = [
                nested.tokenBalance,
                nested.tokenBalances,
                nested.tokenAssets,
                nested.balanceList,
                nested.balances,
                nested.list
            ];
            for (const candidate of candidates) {
                if (Array.isArray(candidate)) {
                    rows.push(...candidate);
                }
            }
        }

        return rows;
    }

    function extractDexTotalValue(payload) {
        const candidates = [];
        const data = unwrapOkxFirst(payload) || (payload && typeof payload === 'object' ? payload.data : null);

        const pushCandidate = (value) => {
            if (value === undefined || value === null) {
                return;
            }
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
                candidates.push(numeric);
            }
        };

        if (data && typeof data === 'object') {
            pushCandidate(data.totalValue);
            pushCandidate(data.totalValueByAddress);
            pushCandidate(data.totalValueByToken);
            pushCandidate(data.totalBalance);
            pushCandidate(data.totalUsdBalance);
            pushCandidate(data.totalUsdValue);
            pushCandidate(data.totalFiatValue);
        }

        pushCandidate(payload?.totalValue);
        pushCandidate(payload?.totalValueByAddress);
        pushCandidate(payload?.totalValueByToken);
        pushCandidate(payload?.totalBalance);
        pushCandidate(payload?.totalUsdBalance);
        pushCandidate(payload?.totalUsdValue);
        pushCandidate(payload?.totalFiatValue);

        return candidates.find((value) => Number.isFinite(value) && value > 0) || null;
    }

    async function fetchOkxDexBalanceSnapshot(walletAddress, options = {}) {
        const normalized = normalizeAddressSafe(walletAddress);
        if (!normalized) {
            return { tokens: [], totalUsd: null };
        }

        const chainShortName = resolveChainContextShortName(options.chainContext);
        const contextChains = Array.from(new Set([
            Number(options.chainContext?.chainId),
            Number(options.chainContext?.chainIndex),
            ...(Array.isArray(options.chainContext?.chains) ? options.chainContext.chains : [])
        ].filter((value) => Number.isFinite(value))));
        const fallbackChains = Array.from(new Set([
            Number(OKX_CHAIN_INDEX_FALLBACK),
            196
        ].filter((value) => Number.isFinite(value))));
        const chainIdList = contextChains.length > 0 ? contextChains : (fallbackChains.length > 0 ? fallbackChains : [196]);

        const query = {
            address: normalized,
            walletAddress: normalized,
            chains: chainIdList,
            chainId: chainIdList[0],
            chainIndex: chainIdList[0],
            chainShortName
        };

        const logBalanceRequest = (endpoint) => {
            try {
                const params = new URLSearchParams();
                params.set('address', query.address);
                params.set('walletAddress', query.walletAddress);
                chainIdList.forEach((id) => params.append('chains', String(id)));
                params.set('chainId', String(query.chainId));
                params.set('chainIndex', String(query.chainIndex));
                params.set('chainShortName', query.chainShortName);
                log.child('DexHoldings').info(`${endpoint} -> ${params.toString()}`);
            } catch (error) {
                // ignore log errors
            }
        };

        let holdings = [];
        let totalUsd = null;

        try {
            logBalanceRequest('/api/v6/dex/balance/all-token-balances-by-address');
            const response = await okxJsonRequest('GET', '/api/v6/dex/balance/all-token-balances-by-address', {
                query,
                auth: hasOkxCredentials,
                expectOkCode: false
            });

            const rows = extractDexHoldingRows(response);
            holdings = rows
                .map((row) => normalizeDexHolding(row))
                .filter(Boolean);

            const responseTotal = extractDexTotalValue(response);
            totalUsd = Number.isFinite(responseTotal) ? responseTotal : null;
        } catch (error) {
            log.child('DexHoldings').warn(`Balance API failed via GET all-token-balances-by-address: ${error.message}`);
        }

        if (!Number.isFinite(totalUsd)) {
            try {
                logBalanceRequest('/api/v6/dex/balance/total-value-by-address');
                const totalResponse = await okxJsonRequest('GET', '/api/v6/dex/balance/total-value-by-address', {
                    query,
                    auth: hasOkxCredentials,
                    expectOkCode: false
                });
                const derivedTotal = extractDexTotalValue(totalResponse);
                if (Number.isFinite(derivedTotal)) {
                    totalUsd = derivedTotal;
                }
            } catch (error) {
                log.child('DexHoldings').warn(`Total value API failed via GET total-value-by-address: ${error.message}`);
            }
        }

        if (!Number.isFinite(totalUsd) && Array.isArray(holdings) && holdings.length > 0) {
            const derived = holdings.reduce((sum, item) => {
                if (Number.isFinite(item?.currencyAmount) && item.currencyAmount > 0) {
                    return sum + item.currencyAmount;
                }
                if (item?.amountRaw !== null && item?.decimals !== undefined && Number.isFinite(item?.priceUsd)) {
                    try {
                        const amount = Number(ethers.formatUnits(item.amountRaw, item.decimals));
                        if (Number.isFinite(amount) && amount > 0) {
                            return sum + amount * item.priceUsd;
                        }
                    } catch (error) {
                        // ignore formatting errors
                    }
                }
                return sum;
            }, 0);

            if (Number.isFinite(derived) && derived > 0) {
                totalUsd = derived;
            }
        }

        if (Array.isArray(holdings) && holdings.length > 0) {
            return { tokens: holdings, totalUsd: Number.isFinite(totalUsd) ? totalUsd : null };
        }

        return { tokens: [], totalUsd: Number.isFinite(totalUsd) ? totalUsd : null };
    }

    async function fetchOkxDexWalletHoldings(walletAddress, options = {}) {
        const normalized = normalizeAddressSafe(walletAddress);
        if (!normalized) {
            return { tokens: [], totalUsd: null };
        }

        const balanceSnapshot = await fetchOkxDexBalanceSnapshot(normalized, options);
        if (Array.isArray(balanceSnapshot.tokens) && balanceSnapshot.tokens.length > 0) {
            return { tokens: balanceSnapshot.tokens, totalUsd: balanceSnapshot.totalUsd };
        }
        return { tokens: [], totalUsd: balanceSnapshot.totalUsd || null };
    }

    async function fetchOkxSupportedChains() {
        const directory = await ensureOkxChainDirectory();

        const formatList = (list) => {
            if (!Array.isArray(list) || list.length === 0) {
                return [];
            }

            const seen = new Set();
            const result = [];

            for (const entry of list) {
                if (!entry) {
                    continue;
                }

                const key = entry.primaryKey
                    || (Number.isFinite(entry.chainIndex) ? `idx:${entry.chainIndex}` : null)
                    || (entry.chainShortName ? normalizeChainKey(entry.chainShortName) : null);

                if (key && seen.has(key)) {
                    continue;
                }

                if (key) {
                    seen.add(key);
                }

                const names = [];
                if (entry.chainName) {
                    names.push(entry.chainName);
                }
                if (entry.chainShortName && entry.chainShortName !== entry.chainName) {
                    names.push(entry.chainShortName);
                }

                const baseLabel = names.length > 1
                    ? `${names[0]} (${names[1]})`
                    : (names[0] || entry.aliases?.[0] || 'Unknown');

                const meta = [];
                if (Number.isFinite(entry.chainIndex)) {
                    meta.push(`#${entry.chainIndex}`);
                }
                if (Number.isFinite(entry.chainId) && entry.chainId !== entry.chainIndex) {
                    meta.push(`id ${entry.chainId}`);
                }

                const metaText = meta.length > 0 ? ` [${meta.join(' · ')}]` : '';
                result.push(`${baseLabel}${metaText}`);
            }

            return result;
        };

        return {
            aggregator: formatList(directory?.aggregator || []),
            market: formatList(directory?.market || []),
            balance: formatList(directory?.balance || [])
        };
    }

    async function fetchOkxBalanceSupportedChains() {
        const payload = await okxJsonRequest('GET', '/api/v6/dex/balance/supported/chain', { query: {}, expectOkCode: false });
        const raw = unwrapOkxData(payload) || [];
        const normalized = raw
            .map((entry) => normalizeOkxChainDirectoryEntry(entry))
            .filter(Boolean);
        return dedupeOkxChainEntries(normalized);
    }

    async function fetchOkx402Supported() {
        const payload = await okxJsonRequest('GET', '/api/v6/x402/supported', { query: {} });
        const data = unwrapOkxData(payload);
        if (!data || data.length === 0) {
            return [];
        }

        return data
            .map((entry) => {
                if (!entry) {
                    return null;
                }
                if (typeof entry === 'string') {
                    return entry;
                }
                if (typeof entry === 'object') {
                    return entry.chainShortName || entry.chainName || entry.name || null;
                }
                return null;
            })
            .filter(Boolean);
    }

    async function fetchOkxTxhashDetail(txHash, options = {}) {
        if (!txHash || typeof txHash !== 'string') {
            return null;
        }

        const normalized = txHash.trim();
        if (!normalized) {
            return null;
        }

        const chainIndex = Number.isFinite(options.chainIndex)
            ? Number(options.chainIndex)
            : (Number.isFinite(OKX_CHAIN_INDEX) ? Number(OKX_CHAIN_INDEX) : OKX_CHAIN_INDEX_FALLBACK);

        const payload = await okxJsonRequest('GET', '/api/v6/dex/post-transaction/transaction-detail-by-txhash', {
            query: {
                txHash: normalized,
                chainIndex: chainIndex || undefined
            },
            expectOkCode: false
        });

        return unwrapOkxFirst(payload);
    }

    function normalizeOkxTopTokenEntry(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const tokenAddress = normalizeOkxConfigAddress(
            entry.tokenContractAddress
            || entry.tokenAddress
            || entry.contractAddress
            || entry.baseTokenAddress
            || entry.baseToken
        );
        const chainIndex = Number.isFinite(entry.chainIndex)
            ? Number(entry.chainIndex)
            : (Number.isFinite(entry.chainId) ? Number(entry.chainId) : null);
        const symbol = typeof entry.tokenSymbol === 'string'
            ? entry.tokenSymbol.trim()
            : (typeof entry.symbol === 'string' ? entry.symbol.trim() : null);
        const name = typeof entry.tokenName === 'string'
            ? entry.tokenName.trim()
            : (typeof entry.name === 'string' ? entry.name.trim() : (symbol || null));
        const logo = typeof entry.tokenLogoUrl === 'string'
            ? entry.tokenLogoUrl.trim()
            : (typeof entry.logoUrl === 'string' ? entry.logoUrl.trim() : (typeof entry.logo === 'string' ? entry.logo.trim() : null));

        const priceUsd = normalizeNumeric(
            entry.priceUsd
            ?? entry.price
            ?? entry.lastPrice
            ?? entry.close
            ?? entry.tokenPrice
        );
        const priceChange = normalizeNumeric(
            entry.priceChangeRatio
            ?? entry.priceChange
            ?? entry.change
            ?? entry.changeRate
            ?? entry.changePercentage
            ?? entry.roc
            ?? entry.roc24h
        );
        const volumeUsd = normalizeNumeric(
            entry.quoteVolume
            ?? entry.volumeUsd
            ?? entry.volume
            ?? entry.vol
            ?? entry.vol24h
        );
        const marketCap = normalizeNumeric(
            entry.marketCap
            ?? entry.circulatingMarketCap
            ?? entry.marketValue
            ?? entry.fdv
            ?? entry.fullyDilutedValue
        );
        const liquidityUsd = normalizeNumeric(
            entry.liquidity
            ?? entry.liquidityUsd
            ?? entry.liquidityValue
        );
        const fdv = normalizeNumeric(entry.fdv || entry.fullyDilutedValue);
        const holderCount = normalizeNumeric(entry.holder || entry.holders || entry.holderCount);
        const txs = normalizeNumeric(entry.txs || entry.txCount || entry.tx || entry.transactions);
        const txsBuy = normalizeNumeric(entry.txsBuy || entry.buyTxs || entry.buyCount || entry.txsBuy24h);
        const txsSell = normalizeNumeric(entry.txsSell || entry.sellTxs || entry.sellCount || entry.txsSell24h);
        const uniqueTraders = normalizeNumeric(entry.uniqueTraders || entry.traderCount || entry.uniqueUsers || entry.traders);
        const firstTradeTime = normalizeNumeric(
            entry.firstTradeTime
            ?? entry.firstTime
            ?? entry.firstTxTime
            ?? entry.launchTime
            ?? entry.createdTime
        );
        const rank = Number.isFinite(entry.rank) ? Number(entry.rank) : null;

        return {
            tokenAddress,
            chainIndex,
            symbol,
            name,
            logo,
            priceUsd,
            priceChange,
            volumeUsd,
            marketCap,
            liquidityUsd,
            fdv,
            holderCount,
            txs,
            txsBuy,
            txsSell,
            uniqueTraders,
            firstTradeTime,
            rank,
            raw: entry
        };
    }

    async function fetchOkxTopTokenList({ chains, sortBy, timeFrame } = {}) {
        const payload = await okxJsonRequest('GET', '/api/v6/dex/market/token/toplist', {
            query: {
                chains: chains !== undefined ? chains : undefined,
                sortBy,
                timeFrame
            },
            expectOkCode: false
        });

        const rawEntries = unwrapOkxData(payload) || [];
        return rawEntries
            .map((entry) => normalizeOkxTopTokenEntry(entry))
            .filter(Boolean);
    }

    async function resolveTopTokenChainEntry(chainIndex) {
        if (!Number.isFinite(chainIndex)) {
            return null;
        }

        try {
            const directory = await ensureOkxChainDirectory();
            const marketChains = directory?.market || [];
            return findChainEntryByIndex(marketChains, chainIndex);
        } catch (error) {
            log.child('TopToken').warn(`Failed to resolve chain entry: ${error.message}`);
            return null;
        }
    }

    async function fetchBanmaoQuoteSnapshot(options = {}) {
        if (!OKX_BANMAO_TOKEN_ADDRESS || !OKX_QUOTE_TOKEN_ADDRESS) {
            throw new Error('Missing OKX token addresses');
        }

        const { chainName, slippagePercent = '0.5', amount: amountOverride } = options;
        const query = await buildOkxDexQuery(chainName, { includeToken: false, includeQuote: false });
        const context = await resolveOkxChainContext(chainName);

        const chainIndex = Number.isFinite(query.chainIndex)
            ? Number(query.chainIndex)
            : (Number.isFinite(context?.chainIndex) ? Number(context.chainIndex) : null);

        if (!Number.isFinite(chainIndex)) {
            throw new Error('Unable to resolve OKX chain index');
        }

        const amount = amountOverride || await resolveBanmaoQuoteAmount(chainName);
        const requestQuery = {
            chainIndex,
            fromTokenAddress: OKX_BANMAO_TOKEN_ADDRESS,
            toTokenAddress: OKX_QUOTE_TOKEN_ADDRESS,
            amount,
            swapMode: 'exactIn',
            slippagePercent
        };

        const payload = await okxJsonRequest('GET', '/api/v6/dex/aggregator/quote', {
            query: requestQuery
        });

        const quoteEntries = unwrapOkxData(payload);
        const quoteEntry = selectOkxQuoteByLiquidity(quoteEntries) || unwrapOkxFirst(payload);
        if (!quoteEntry) {
            return null;
        }

        const priceInfo = extractOkxQuotePrice(quoteEntry, { requestAmount: amount });
        if (!Number.isFinite(priceInfo.price) || priceInfo.price <= 0) {
            return null;
        }

        const chainLabel = context?.chainName || context?.chainShortName || query.chainShortName || chainName || '(default)';
        const okbUsd = resolveOkbUsdPrice(priceInfo.tokenUnitPrices);
        const priceOkb = Number.isFinite(priceInfo.price) && Number.isFinite(okbUsd) && okbUsd > 0
            ? priceInfo.price / okbUsd
            : null;

        const extractSymbol = (token, fallback) => {
            if (!token || typeof token !== 'object') {
                return fallback;
            }

            const candidate = typeof token.tokenSymbol === 'string'
                ? token.tokenSymbol
                : (typeof token.symbol === 'string' ? token.symbol : null);

            if (candidate && candidate.trim()) {
                return candidate.trim().toUpperCase();
            }

            return fallback;
        };

        const routerList = Array.isArray(quoteEntry.dexRouterList) ? quoteEntry.dexRouterList : [];
        const firstRoute = routerList[0] || null;
        const lastRoute = routerList.length > 0 ? routerList[routerList.length - 1] : null;

        const fromSymbol = extractSymbol(quoteEntry.fromToken, extractSymbol(firstRoute?.fromToken, 'BANMAO'));
        const toSymbol = extractSymbol(quoteEntry.toToken, extractSymbol(lastRoute?.toToken, 'USDT'));

        const tradeFeeUsd = normalizeNumeric(quoteEntry.tradeFee);
        const priceImpactPercent = normalizeNumeric(quoteEntry.priceImpactPercent);
        const routeLabel = summarizeOkxQuoteRoute(quoteEntry);

        return {
            price: priceInfo.price,
            priceOkb: Number.isFinite(priceOkb) ? priceOkb : null,
            okbUsd: Number.isFinite(okbUsd) ? okbUsd : null,
            chain: chainLabel,
            chainIndex,
            source: 'OKX DEX quote',
            amount,
            decimals: priceInfo.fromDecimals,
            quoteDecimals: priceInfo.toDecimals,
            fromAmount: priceInfo.fromAmount,
            toAmount: priceInfo.toAmount,
            fromSymbol,
            toSymbol,
            tradeFeeUsd: Number.isFinite(tradeFeeUsd) ? tradeFeeUsd : null,
            priceImpactPercent: Number.isFinite(priceImpactPercent) ? priceImpactPercent : null,
            routeLabel,
            tokenPrices: priceInfo.tokenUnitPrices,
            derivedPrice: priceInfo.amountPrice,
            raw: quoteEntry
        };
    }

    async function resolveBanmaoQuoteAmount(chainName) {
        const decimals = await getBanmaoTokenDecimals(chainName);
        const safeDecimals = Number.isFinite(decimals) ? Math.max(0, Math.min(36, Math.trunc(decimals))) : BANMAO_DECIMALS_DEFAULT;

        try {
            return (BigInt(10) ** BigInt(safeDecimals)).toString();
        } catch (error) {
            return '1000000000000000000';
        }
    }

    async function getBanmaoTokenDecimals(chainName) {
        const now = Date.now();
        const { banmaoDecimalsCache, banmaoDecimalsFetchedAt } = getBanmaoDecimalsCache();
        if (banmaoDecimalsCache !== null && banmaoDecimalsFetchedAt > 0 && now - banmaoDecimalsFetchedAt < BANMAO_DECIMALS_CACHE_TTL) {
            return banmaoDecimalsCache;
        }

        try {
            const profile = await fetchBanmaoTokenProfile({ chainName });
            const decimals = pickOkxNumeric(profile || {}, ['decimals', 'tokenDecimals', 'tokenDecimal', 'decimal']);
            if (Number.isFinite(decimals)) {
                const normalized = Math.max(0, Math.trunc(decimals));
                setBanmaoDecimalsCache(normalized, now);
                return normalized;
            }
        } catch (error) {
            log.child('BanmaoDecimals').warn(`Failed to load token profile: ${error.message}`);
        }

        if (banmaoDecimalsCache !== null) {
            return banmaoDecimalsCache;
        }
        return BANMAO_DECIMALS_DEFAULT;
    }

    async function resolveTokenDecimals(tokenAddress, options = {}) {
        const { chainName, fallback = null } = options;

        if (!tokenAddress || typeof tokenAddress !== 'string') {
            return fallback;
        }

        const normalized = normalizeOkxConfigAddress(tokenAddress);
        const addressText = normalized || tokenAddress;
        const lower = addressText.toLowerCase();

        if (BANMAO_ADDRESS_LOWER && lower === BANMAO_ADDRESS_LOWER) {
            return getBanmaoTokenDecimals(chainName);
        }

        if (OKX_QUOTE_ADDRESS_LOWER && lower === OKX_QUOTE_ADDRESS_LOWER) {
            return 6;
        }

        if (OKX_OKB_TOKEN_ADDRESSES.includes(lower)) {
            return 18;
        }

        const cached = tokenDecimalsCache.get(lower);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            return cached.value;
        }

        try {
            const profile = await fetchBanmaoTokenProfile({ chainName, tokenAddress: addressText });
            const decimals = pickOkxNumeric(profile || {}, ['decimals', 'tokenDecimals', 'tokenDecimal', 'decimal']);
            if (Number.isFinite(decimals)) {
                tokenDecimalsCache.set(lower, { value: Math.max(0, Math.trunc(decimals)), expiresAt: now + BANMAO_DECIMALS_CACHE_TTL });
                return Math.max(0, Math.trunc(decimals));
            }
        } catch (error) {
            log.child('TokenDecimals').warn(`Failed to resolve decimals for ${tokenAddress}: ${error.message}`);
        }

        tokenDecimalsCache.set(lower, { value: fallback, expiresAt: now + (BANMAO_DECIMALS_CACHE_TTL / 2) });
        return fallback;
    }

    async function fetchBanmaoPrice() {
        const errors = [];

        try {
            const quoteSnapshot = await fetchBanmaoQuoteSnapshot();
            if (quoteSnapshot && Number.isFinite(quoteSnapshot.price)) {
                return quoteSnapshot;
            }
        } catch (error) {
            log.child('BanmaoPrice').warn(`Quote snapshot failed: ${error.message}`);
            errors.push(error);
        }

        try {
            const snapshot = await fetchBanmaoMarketSnapshot();
            if (snapshot && Number.isFinite(snapshot.price)) {
                return snapshot;
            }
        } catch (error) {
            log.child('BanmaoPrice').warn(`Market snapshot failed: ${error.message}`);
            errors.push(error);
        }

        try {
            const fallbackTicker = await tryFetchOkxMarketTicker();
            if (fallbackTicker) {
                return fallbackTicker;
            }
        } catch (error) {
            log.child('BanmaoPrice').warn(`Market ticker fallback failed: ${error.message}`);
            errors.push(error);
        }

        if (errors.length > 0) {
            throw errors[errors.length - 1];
        }

        throw new Error('No price data available');
    }

    async function fetchBanmaoMarketSnapshot() {
        const chainNames = getOkxChainShortNameCandidates();
        const errors = [];

        for (const chainName of chainNames) {
            try {
                const snapshot = await fetchBanmaoMarketSnapshotForChain(chainName);
                if (snapshot) {
                    return snapshot;
                }
            } catch (error) {
                errors.push(error);
            }
        }

        try {
            const fallbackSnapshot = await fetchBanmaoMarketSnapshotForChain();
            if (fallbackSnapshot) {
                return fallbackSnapshot;
            }
        } catch (error) {
            errors.push(error);
        }

        if (errors.length > 0) {
            throw errors[errors.length - 1];
        }

        return null;
    }

    async function fetchBanmaoMarketSnapshotForChain(chainName) {
        if (!OKX_BANMAO_TOKEN_ADDRESS) {
            throw new Error('Missing OKX_BANMAO_TOKEN_ADDRESS');
        }
        return fetchTokenMarketSnapshotForChain({ chainName, tokenAddress: OKX_BANMAO_TOKEN_ADDRESS });
    }

    async function fetchTokenMarketSnapshot(options = {}) {
        const { tokenAddress, chainName } = options;
        if (!tokenAddress) {
            return null;
        }

        const normalized = normalizeOkxConfigAddress(tokenAddress) || tokenAddress;
        if (!normalized) {
            return null;
        }

        const errors = [];
        const chainCandidates = chainName ? [chainName] : getOkxChainShortNameCandidates();

        for (const candidate of chainCandidates) {
            try {
                const snapshot = await fetchTokenMarketSnapshotForChain({ chainName: candidate, tokenAddress: normalized });
                if (snapshot) {
                    return snapshot;
                }
            } catch (error) {
                errors.push(error);
            }
        }

        try {
            const fallbackSnapshot = await fetchTokenMarketSnapshotForChain({ tokenAddress: normalized });
            if (fallbackSnapshot) {
                return fallbackSnapshot;
            }
        } catch (error) {
            errors.push(error);
        }

        if (errors.length > 0) {
            throw errors[errors.length - 1];
        }

        return null;
    }

    async function fetchTokenMarketSnapshotForChain({ chainName, tokenAddress }) {
        if (!tokenAddress) {
            return null;
        }
        const query = await buildOkxDexQuery(chainName, { tokenAddress });
        const chainLabel = query.chainShortName || chainName || '(default)';
        const errors = [];

        let priceInfoEntry = null;
        try {
            const payload = await callOkxDexEndpoint('/api/v6/dex/market/price-info', query, {
                method: 'POST',
                bodyType: 'array'
            });
            priceInfoEntry = unwrapOkxFirst(payload);
        } catch (error) {
            errors.push(new Error(`[price-info:${chainLabel}] ${error.message}`));
        }

        let priceEntry = priceInfoEntry;
        let source = 'OKX DEX price-info';

        if (!Number.isFinite(extractOkxPriceValue(priceEntry))) {
            try {
                const payload = await callOkxDexEndpoint('/api/v6/dex/market/price', query, { method: 'POST' });
                priceEntry = unwrapOkxFirst(payload);
                source = 'OKX DEX price';
            } catch (error) {
                errors.push(new Error(`[price:${chainLabel}] ${error.message}`));
            }
        }

        const tokenPrices = collectOkxTokenUnitPrices(priceEntry || priceInfoEntry);

        let price = extractOkxPriceValue(priceEntry);
        if (!Number.isFinite(price) && tokenPrices && Number.isFinite(tokenPrices.fromTokenUsd)) {
            price = tokenPrices.fromTokenUsd;
        }

        if (!Number.isFinite(price)) {
            if (errors.length > 0) {
                throw errors[errors.length - 1];
            }
            return null;
        }

        const metricsSource = priceInfoEntry || priceEntry || {};
        const changeAbs = pickOkxNumeric(metricsSource, ['usdChange24h', 'change24h', 'priceChangeUsd', 'priceChange', 'usdChange']);
        const changePercent = pickOkxNumeric(metricsSource, ['changeRate', 'changePercent', 'priceChangePercent', 'percentChange24h', 'change24hPercent']);
        const volume = pickOkxNumeric(metricsSource, ['usdVolume24h', 'volumeUsd24h', 'volume24h', 'turnover24h', 'usdTurnover24h']);
        const liquidity = pickOkxNumeric(metricsSource, ['usdLiquidity', 'liquidityUsd', 'poolLiquidity', 'liquidity']);
        const marketCap = pickOkxNumeric(metricsSource, ['usdMarketCap', 'marketCap', 'fdvUsd', 'fullyDilutedMarketCap', 'marketCapUsd']);
        const supply = pickOkxNumeric(metricsSource, ['totalSupply', 'supply', 'circulatingSupply']);
        const okbUsd = resolveOkbUsdPrice(tokenPrices);
        const priceOkb = Number.isFinite(price) && Number.isFinite(okbUsd) && okbUsd > 0
            ? price / okbUsd
            : null;

        return {
            price,
            priceOkb: Number.isFinite(priceOkb) ? priceOkb : null,
            okbUsd: Number.isFinite(okbUsd) ? okbUsd : null,
            changeAbs,
            changePercent,
            volume,
            liquidity,
            marketCap,
            supply,
            chain: chainLabel,
            source,
            tokenPrices,
            raw: { priceEntry, priceInfoEntry }
        };
    }

    async function fetchTokenPriceOverview(options = {}) {
        const { tokenAddress, chainIndex = null, chainShortName = null, throttleMs = 0 } = options;
        const normalizedAddress = typeof tokenAddress === 'string' ? tokenAddress.trim() : tokenAddress;
        if (!normalizedAddress) {
            throw new Error('Missing token address');
        }

        const baseQuery = ensureQueryChainParams({
            tokenContractAddress: normalizedAddress,
            tokenAddress: normalizedAddress,
            chainIndex: Number.isFinite(chainIndex) ? Number(chainIndex) : undefined,
            chainShortName: chainShortName || undefined
        }, { includeToken: false });

        let priceInfoEntry = null;
        let lastError = null;
        try {
            const payload = await callOkxDexEndpoint('/api/v6/dex/market/price-info', baseQuery, {
                method: 'POST',
                bodyType: 'array'
            });
            priceInfoEntry = unwrapOkxFirst(payload);
        } catch (error) {
            lastError = error;
        }

        if (throttleMs) {
            await delay(throttleMs);
        }

        let basicInfoEntry = null;
        try {
            const payload = await callOkxDexEndpoint('/api/v6/dex/market/token/basic-info', baseQuery, {
                method: 'POST',
                bodyType: 'array'
            });
            basicInfoEntry = unwrapOkxFirst(payload);
        } catch (error) {
            lastError = lastError || error;
        }

        if (!priceInfoEntry && !basicInfoEntry) {
            if (lastError) {
                throw lastError;
            }
            return null;
        }

        const tokenPrices = collectOkxTokenUnitPrices(priceInfoEntry);
        let priceUsd = extractOkxPriceValue(priceInfoEntry);
        if (!Number.isFinite(priceUsd) && tokenPrices && Number.isFinite(tokenPrices.fromTokenUsd)) {
            priceUsd = tokenPrices.fromTokenUsd;
        }
        const resolveRefPrice = (symbols = [], addresses = []) => {
            const bySymbol = tokenPrices?.bySymbol || new Map();
            for (const symbol of symbols) {
                if (!symbol) {
                    continue;
                }
                const entry = bySymbol.get(symbol.toLowerCase());
                if (entry && Number.isFinite(entry.unitPrice)) {
                    return entry.unitPrice;
                }
            }
            const byAddress = tokenPrices?.byAddress || new Map();
            for (const addr of addresses) {
                if (!addr) continue;
                const normalized = normalizeOkxTokenAddress(addr);
                const entry = normalized ? byAddress.get(normalized) : null;
                if (entry && Number.isFinite(entry.unitPrice)) {
                    return entry.unitPrice;
                }
            }
            return null;
        };

        let okbUsd = resolveOkbUsdPrice(tokenPrices);
        if (!Number.isFinite(okbUsd)) {
            okbUsd = resolveRefPrice(['OKB', 'WOKB'], [REF_OKB_ADDRESS, ...(OKX_OKB_TOKEN_ADDRESSES || [])]);
        }
        if (!Number.isFinite(okbUsd) && REF_OKB_ADDRESS) {
            okbUsd = await fetchReferenceTokenPriceUsd({
                tokenAddress: REF_OKB_ADDRESS,
                chainIndex: REF_OKB_CHAIN,
                label: 'okb'
            });
        }
        let ethUsd = resolveRefPrice(['ETH', 'WETH'], [REF_ETH_ADDRESS]);
        if (!Number.isFinite(ethUsd) && REF_ETH_ADDRESS) {
            ethUsd = await fetchReferenceTokenPriceUsd({
                tokenAddress: REF_ETH_ADDRESS,
                chainIndex: REF_ETH_CHAIN,
                label: 'eth'
            });
        }
        let btcUsd = null;
        if (REF_BTC_ADDRESS && Number.isFinite(REF_BTC_CHAIN)) {
            btcUsd = await fetchReferenceTokenPriceUsd({
                tokenAddress: REF_BTC_ADDRESS,
                chainIndex: REF_BTC_CHAIN,
                label: 'btc'
            });
        }

        const priceOkb = Number.isFinite(priceUsd) && Number.isFinite(okbUsd) && okbUsd > 0
            ? priceUsd / okbUsd
            : null;
        const priceEth = Number.isFinite(priceUsd) && Number.isFinite(ethUsd) && ethUsd > 0
            ? priceUsd / ethUsd
            : null;
        const priceBtc = Number.isFinite(priceUsd) && Number.isFinite(btcUsd) && btcUsd > 0
            ? priceUsd / btcUsd
            : null;

        const liquidity = pickOkxNumeric(priceInfoEntry, ['usdLiquidity', 'liquidityUsd', 'poolLiquidity', 'liquidity']);
        const marketCap = pickOkxNumeric(priceInfoEntry, ['usdMarketCap', 'marketCap', 'fdvUsd', 'fullyDilutedMarketCap', 'marketCapUsd']);
        const holders = pickOkxNumeric(priceInfoEntry, ['holders']);
        const change24h = pickOkxNumeric(priceInfoEntry, ['priceChange24H', 'priceChange24h', 'change24hPercent', 'change24h', 'priceChange']);
        const volume24H = pickOkxNumeric(priceInfoEntry, ['usdVolume24h', 'usdVolume24H', 'turnover24h', 'volume24h', 'volume24H', 'volumeUsd24h']);
        const circSupply = pickOkxNumeric(priceInfoEntry, ['circSupply', 'circulatingSupply', 'circulating']);
        const txs24H = pickOkxNumeric(priceInfoEntry, ['txs24H', 'txs24h', 'transactions24h', 'txCount24h']);
        const tradeNum = pickOkxNumeric(priceInfoEntry, ['tradeNum', 'totalTrades', 'trades', 'tradeCount']);

        return {
            chainIndex: baseQuery.chainIndex,
            chainShortName: baseQuery.chainShortName,
            tokenAddress: normalizedAddress,
            tokenName: basicInfoEntry?.tokenName || priceInfoEntry?.tokenName || null,
            tokenSymbol: basicInfoEntry?.tokenSymbol || priceInfoEntry?.tokenSymbol || null,
            tokenLogoUrl: basicInfoEntry?.tokenLogoUrl || basicInfoEntry?.logoUrl || priceInfoEntry?.tokenLogoUrl || null,
            decimals: basicInfoEntry?.decimal !== undefined ? Number(basicInfoEntry.decimal) : null,
            priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
            priceOkb: Number.isFinite(priceOkb) ? priceOkb : null,
            priceEth: Number.isFinite(priceEth) ? priceEth : null,
            priceBtc: Number.isFinite(priceBtc) ? priceBtc : null,
            okbUsd: Number.isFinite(okbUsd) ? okbUsd : null,
            ethUsd: Number.isFinite(ethUsd) ? ethUsd : null,
            btcUsd: Number.isFinite(btcUsd) ? btcUsd : null,
            liquidity: normalizeNumeric(liquidity),
            marketCap: normalizeNumeric(marketCap),
            holders: normalizeNumeric(holders),
            change24h: normalizeNumeric(change24h),
            volume24H: normalizeNumeric(volume24H),
            circSupply: normalizeNumeric(circSupply),
            txs24H: normalizeNumeric(txs24H),
            tradeNum: normalizeNumeric(tradeNum),
            fetchedAt: Date.now(),
            tokenPrices,
            raw: { priceInfoEntry, basicInfoEntry }
        };
    }

    async function fetchBanmaoTokenProfile(options = {}) {
        const { chainName, tokenAddress } = options;
        const query = await buildOkxDexQuery(chainName, { includeToken: false });
        const normalizedAddress = tokenAddress
            ? normalizeOkxConfigAddress(tokenAddress) || tokenAddress
            : OKX_BANMAO_TOKEN_ADDRESS;

        if (normalizedAddress) {
            query.tokenAddress = normalizedAddress;
            query.tokenContractAddress = normalizedAddress;
        }

        const payload = await callOkxDexEndpoint('/api/v6/dex/market/token/basic-info', query, {
            method: 'POST',
            bodyType: 'array'
        });
        return unwrapOkxFirst(payload);
    }

    async function tryFetchOkxMarketTicker() {
        if (!OKX_MARKET_INSTRUMENT) {
            return null;
        }

        const payload = await okxJsonRequest('GET', '/api/v5/market/ticker', {
            query: { instId: OKX_MARKET_INSTRUMENT },
            expectOkCode: true,
            auth: hasOkxCredentials
        });

        const tickerEntry = unwrapOkxFirst(payload);
        const price = extractOkxPriceValue(tickerEntry);
        const tokenPrices = collectOkxTokenUnitPrices(tickerEntry || {});
        const okbUsd = resolveOkbUsdPrice(tokenPrices);
        const priceOkb = Number.isFinite(price) && Number.isFinite(okbUsd) && okbUsd > 0
            ? price / okbUsd
            : null;

        if (Number.isFinite(price)) {
            return {
                price,
                priceOkb: Number.isFinite(priceOkb) ? priceOkb : null,
                okbUsd: Number.isFinite(okbUsd) ? okbUsd : null,
                source: 'OKX market ticker',
                chain: null
            };
        }

        return null;
    }

    function extractOkxPriceValue(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const priceKeys = [
            'usdPrice',
            'price',
            'priceUsd',
            'lastPrice',
            'last',
            'close',
            'markPrice',
            'quotePrice',
            'tokenPrice',
            'tokenUnitPrice',
            'usdValue',
            'value',
            'bestAskPrice',
            'bestBidPrice',
            'bestAsk',
            'bestBid',
            'askPx',
            'bidPx'
        ];

        for (const key of priceKeys) {
            if (Object.prototype.hasOwnProperty.call(entry, key)) {
                const numeric = normalizeNumeric(entry[key]);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }
        }

        const nestedKeys = ['prices', 'priceInfo', 'tokenPrices', 'ticker', 'bestAsk', 'bestBid'];
        for (const nestedKey of nestedKeys) {
            const nested = entry[nestedKey];
            const numeric = extractFromNested(nested);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }

        if (Array.isArray(entry.data)) {
            const numeric = extractFromNested(entry.data);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }

        return null;
    }

    function extractFromNested(value) {
        if (!value) {
            return null;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                const numeric = extractOkxPriceValue(item);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }
            return null;
        }

        if (typeof value === 'object') {
            const nestedValues = Object.values(value);
            for (const nested of nestedValues) {
                const numeric = extractOkxPriceValue(nested);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }
        }

        return normalizeNumeric(value);
    }

    function pickOkxNumeric(entry, keys) {
        if (!entry || typeof entry !== 'object' || !Array.isArray(keys)) {
            return null;
        }

        for (const key of keys) {
            if (!key || typeof key !== 'string') {
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(entry, key)) {
                const numeric = normalizeNumeric(entry[key]);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }
        }

        return null;
    }

    function normalizeOkxTokenAddress(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }

        const normalized = normalizeOkxConfigAddress(value);
        if (normalized) {
            return normalized.toLowerCase();
        }

        const trimmed = value.trim();
        return trimmed ? trimmed.toLowerCase() : null;
    }

    async function fetchReferenceTokenPriceUsd({ tokenAddress, chainIndex, label = 'ref' }) {
        const address = normalizeOkxTokenAddress(tokenAddress);
        if (!address || !Number.isFinite(chainIndex)) {
            return null;
        }
        const body = [{ chainIndex, tokenContractAddress: address }];
        try {
            const payload = await callOkxDexEndpoint('/api/v6/dex/market/price', body, {
                method: 'POST',
                bodyType: 'array'
            });
            const entry = unwrapOkxFirst(payload);
            const price = extractOkxPriceValue(entry);
            return Number.isFinite(price) ? price : null;
        } catch (error) {
            log.warn(`Failed to fetch ${label} price: ${error.message}`);
            return null;
        }
    }

    function extractOkxTokenUnitPrice(token) {
        if (!token || typeof token !== 'object') {
            return null;
        }

        const keys = ['tokenUnitPrice', 'unitPrice', 'priceUsd', 'usdPrice', 'price'];
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(token, key)) {
                continue;
            }

            const numeric = normalizeNumeric(token[key]);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }

        return null;
    }

    function collectOkxTokenUnitPrices(entry, routerList = []) {
        const tokens = [];
        const byAddress = new Map();
        const bySymbol = new Map();

        const register = (token, meta = {}) => {
            if (!token || typeof token !== 'object') {
                return;
            }

            const unitPrice = extractOkxTokenUnitPrice(token);
            if (!Number.isFinite(unitPrice)) {
                return;
            }

            const symbol = typeof token.tokenSymbol === 'string'
                ? token.tokenSymbol.trim().toUpperCase()
                : (typeof token.symbol === 'string' ? token.symbol.trim().toUpperCase() : null);

            const addressCandidates = [
                token.tokenContractAddress,
                token.tokenAddress,
                token.contractAddress,
                token.address,
                token.baseTokenAddress,
                token.baseToken,
                token.fromTokenAddress,
                token.toTokenAddress,
                token.mintAddress
            ];

            let normalizedAddress = null;
            for (const candidate of addressCandidates) {
                const normalized = normalizeOkxTokenAddress(candidate);
                if (normalized) {
                    normalizedAddress = normalized;
                    break;
                }
            }

            const record = {
                unitPrice,
                symbol,
                address: normalizedAddress,
                meta,
                raw: token
            };

            tokens.push(record);

            if (normalizedAddress && !byAddress.has(normalizedAddress)) {
                byAddress.set(normalizedAddress, record);
            }

            if (symbol) {
                const symbolKey = symbol.toLowerCase();
                if (!bySymbol.has(symbolKey)) {
                    bySymbol.set(symbolKey, record);
                }
            }
        };

        register(entry?.fromToken, { source: 'fromToken' });
        register(entry?.toToken, { source: 'toToken' });
        register(entry?.sellToken, { source: 'sellToken' });
        register(entry?.buyToken, { source: 'buyToken' });

        routerList.forEach((route, index) => {
            register(route?.fromToken, { source: 'router', hop: index, side: 'from' });
            register(route?.toToken, { source: 'router', hop: index, side: 'to' });
        });

        const fromTokenEntry = BANMAO_ADDRESS_LOWER && byAddress.has(BANMAO_ADDRESS_LOWER)
            ? byAddress.get(BANMAO_ADDRESS_LOWER)
            : null;
        const quoteTokenEntry = OKX_QUOTE_ADDRESS_LOWER && byAddress.has(OKX_QUOTE_ADDRESS_LOWER)
            ? byAddress.get(OKX_QUOTE_ADDRESS_LOWER)
            : null;

        return {
            list: tokens,
            byAddress,
            bySymbol,
            fromTokenUsd: fromTokenEntry && Number.isFinite(fromTokenEntry.unitPrice)
                ? fromTokenEntry.unitPrice
                : null,
            quoteTokenUsd: quoteTokenEntry && Number.isFinite(quoteTokenEntry.unitPrice)
                ? quoteTokenEntry.unitPrice
                : null
        };
    }

    function summarizeOkxQuoteRoute(entry) {
        const list = Array.isArray(entry?.dexRouterList) ? entry.dexRouterList : [];
        if (list.length === 0) {
            return null;
        }

        const seen = new Set();
        const names = [];

        const normalizeName = (value) => {
            if (!value || typeof value !== 'string') {
                return null;
            }

            const trimmed = value.trim();
            return trimmed ? trimmed : null;
        };

        const extractDexName = (hop) => {
            const nameCandidates = [
                hop?.dexProtocol?.dexName,
                hop?.dexProtocol?.name,
                hop?.dexName
            ];

            for (const candidate of nameCandidates) {
                const normalized = normalizeName(candidate);
                if (normalized) {
                    return normalized;
                }
            }

            return null;
        };

        const extractTokenAddress = (token) => {
            if (!token || typeof token !== 'object') {
                return null;
            }

            const candidates = [
                token.tokenContractAddress,
                token.tokenAddress,
                token.contractAddress,
                token.address
            ];

            for (const candidate of candidates) {
                if (typeof candidate === 'string' && candidate) {
                    return candidate.trim().toLowerCase();
                }
            }

            return null;
        };

        const pushName = (name) => {
            if (!name) {
                return;
            }

            const key = name.toLowerCase();
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            names.push(name);
        };

        if (BANMAO_ADDRESS_LOWER) {
            for (const hop of list) {
                const fromAddress = extractTokenAddress(hop?.fromToken);
                if (fromAddress && fromAddress === BANMAO_ADDRESS_LOWER) {
                    pushName(extractDexName(hop));
                    break;
                }
            }
        }

        for (const hop of list) {
            pushName(extractDexName(hop));
        }

        if (names.length === 0) {
            return null;
        }

        return names.join(' · ');
    }

    function resolveOkbUsdPrice(tokenPrices) {
        if (!tokenPrices) {
            return null;
        }

        const { byAddress, bySymbol, list } = tokenPrices;

        if (byAddress instanceof Map) {
            for (const address of OKX_OKB_TOKEN_ADDRESSES) {
                if (!address) {
                    continue;
                }

                const entry = byAddress.get(address);
                if (entry && Number.isFinite(entry.unitPrice)) {
                    return entry.unitPrice;
                }
            }
        }

        if (bySymbol instanceof Map) {
            for (const key of OKX_OKB_SYMBOL_KEYS) {
                if (!key) {
                    continue;
                }

                const entry = bySymbol.get(key);
                if (entry && Number.isFinite(entry.unitPrice)) {
                    return entry.unitPrice;
                }
            }
        }

        if (Array.isArray(list)) {
            for (const entry of list) {
                if (!entry || !Number.isFinite(entry.unitPrice)) {
                    continue;
                }

                const symbol = typeof entry.symbol === 'string' ? entry.symbol.toUpperCase() : '';
                if (symbol.includes('OKB')) {
                    return entry.unitPrice;
                }
            }
        }

        return null;
    }

    function selectOkxQuoteByLiquidity(quotes) {
        if (!Array.isArray(quotes) || quotes.length === 0) {
            return null;
        }

        let bestEntry = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const entry of quotes) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            const score = computeOkxQuoteLiquidityScore(entry);
            if (Number.isFinite(score)) {
                if (!Number.isFinite(bestScore) || score > bestScore) {
                    bestScore = score;
                    bestEntry = entry;
                }
            } else if (bestEntry === null) {
                bestEntry = entry;
            }
        }

        return bestEntry;
    }

    function computeOkxQuoteLiquidityScore(entry) {
        const routerList = Array.isArray(entry?.dexRouterList) ? entry.dexRouterList : [];
        let bestLiquidity = null;

        for (const hop of routerList) {
            const hopLiquidity = pickOkxNumeric(hop, [
                'liquidityUsd',
                'usdLiquidity',
                'poolLiquidity',
                'liquidity',
                'reserveUsd',
                'valueUsd'
            ]);

            if (Number.isFinite(hopLiquidity)) {
                bestLiquidity = Number.isFinite(bestLiquidity)
                    ? Math.max(bestLiquidity, hopLiquidity)
                    : hopLiquidity;
            }
        }

        if (Number.isFinite(bestLiquidity)) {
            return bestLiquidity;
        }

        const decimalsCandidates = [
            pickOkxNumeric(entry, ['toTokenDecimals', 'buyTokenDecimals', 'toDecimals', 'toTokenDecimal']),
            pickOkxNumeric(entry?.toToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
            pickOkxNumeric(entry?.buyToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
            pickOkxNumeric(routerList.length > 0 ? routerList[routerList.length - 1]?.toToken : null, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal'])
        ];

        const toDecimals = normalizeDecimalsCandidate(decimalsCandidates);
        const toAmount = parseBigIntValue(
            entry?.toTokenAmount
            ?? entry?.buyTokenAmount
            ?? entry?.toAmount
            ?? entry?.outputAmount
        );

        if (toAmount === null) {
            return null;
        }

        const decimals = Number.isFinite(toDecimals) ? Math.max(0, Math.trunc(toDecimals)) : 0;
        let quantity = null;

        try {
            quantity = Number(ethers.formatUnits(toAmount, decimals));
        } catch (error) {
            quantity = null;
        }

        if (!Number.isFinite(quantity)) {
            const numeric = Number(toAmount);
            if (Number.isFinite(numeric)) {
                quantity = numeric / Math.pow(10, decimals);
            }
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return null;
        }

        const tokenPrices = collectOkxTokenUnitPrices(entry, routerList);
        const quoteUsd = Number.isFinite(tokenPrices?.quoteTokenUsd) && tokenPrices.quoteTokenUsd > 0
            ? tokenPrices.quoteTokenUsd
            : 1;

        return quantity * quoteUsd;
    }

    function normalizeDecimalsCandidate(candidates) {
        if (!Array.isArray(candidates)) {
            return null;
        }

        for (const candidate of candidates) {
            const numeric = normalizeNumeric(candidate);
            if (Number.isFinite(numeric)) {
                return Math.max(0, Math.trunc(numeric));
            }
        }

        return null;
    }

    function computePriceFromTokenAmounts(fromAmount, toAmount, fromDecimals, toDecimals) {
        if (fromAmount === null || toAmount === null) {
            return null;
        }

        const hasFromDecimals = Number.isFinite(fromDecimals);
        const hasToDecimals = Number.isFinite(toDecimals);
        const fromDigits = hasFromDecimals ? Math.max(0, Math.trunc(fromDecimals)) : 0;
        const toDigits = hasToDecimals ? Math.max(0, Math.trunc(toDecimals)) : 0;

        try {
            const numerator = toAmount * (BigInt(10) ** BigInt(fromDigits));
            const denominator = fromAmount * (BigInt(10) ** BigInt(toDigits));
            if (denominator === 0n) {
                return null;
            }

            const ratio = Number(numerator) / Number(denominator);
            if (Number.isFinite(ratio)) {
                return ratio;
            }
        } catch (error) {
            // Fallback to floating point math below
        }

        const fromNumeric = Number(fromAmount);
        const toNumeric = Number(toAmount);
        if (Number.isFinite(fromNumeric) && fromNumeric > 0 && Number.isFinite(toNumeric)) {
            let ratio = toNumeric / fromNumeric;
            if (hasFromDecimals || hasToDecimals) {
                const decimalsDiff = fromDigits - toDigits;
                if (decimalsDiff !== 0) {
                    ratio *= Math.pow(10, decimalsDiff);
                }
            }
            return Number.isFinite(ratio) ? ratio : null;
        }

        return null;
    }

    function extractOkxQuotePrice(entry, options = {}) {
        if (!entry || typeof entry !== 'object') {
            return {
                price: null,
                fromDecimals: null,
                toDecimals: null,
                fromAmount: null,
                toAmount: null,
                tokenUnitPrices: null,
                quotePrice: null,
                amountPrice: null
            };
        }

        const directPrice = extractOkxPriceValue(entry);
        const routerList = Array.isArray(entry.dexRouterList) ? entry.dexRouterList : [];
        const firstRoute = routerList[0] || null;
        const lastRoute = routerList.length > 0 ? routerList[routerList.length - 1] : null;

        const fromDecimalsCandidates = [
            pickOkxNumeric(entry, ['fromTokenDecimals', 'sellTokenDecimals', 'fromDecimals', 'fromTokenDecimal']),
            pickOkxNumeric(entry.fromToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
            pickOkxNumeric(entry.sellToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
            pickOkxNumeric(firstRoute?.fromToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal'])
        ];

        const toDecimalsCandidates = [
            pickOkxNumeric(entry, ['toTokenDecimals', 'buyTokenDecimals', 'toDecimals', 'toTokenDecimal']),
            pickOkxNumeric(entry.toToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
            pickOkxNumeric(entry.buyToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal']),
            pickOkxNumeric(lastRoute?.toToken, ['decimal', 'decimals', 'tokenDecimals', 'tokenDecimal'])
        ];

        const fromDecimals = normalizeDecimalsCandidate(fromDecimalsCandidates);
        const toDecimals = normalizeDecimalsCandidate(toDecimalsCandidates);

        const tokenPrices = collectOkxTokenUnitPrices(entry, routerList);

        const fromAmount = parseBigIntValue(
            entry.fromTokenAmount
            ?? entry.sellTokenAmount
            ?? entry.fromAmount
            ?? entry.inputAmount
            ?? options.requestAmount
        );

        const toAmount = parseBigIntValue(
            entry.toTokenAmount
            ?? entry.buyTokenAmount
            ?? entry.toAmount
            ?? entry.outputAmount
        );

        const priceFromAmounts = (fromAmount !== null && toAmount !== null)
            ? computePriceFromTokenAmounts(fromAmount, toAmount, fromDecimals, toDecimals)
            : null;

        let price = tokenPrices && Number.isFinite(tokenPrices.fromTokenUsd)
            ? tokenPrices.fromTokenUsd
            : null;

        if (!Number.isFinite(price) && Number.isFinite(directPrice)) {
            price = Number(directPrice);
        }

        if (!Number.isFinite(price) && Number.isFinite(priceFromAmounts)) {
            price = priceFromAmounts;
        }

        const toAmountUsd = pickOkxNumeric(entry, ['toAmountUsd', 'toUsdAmount', 'toAmountInUsd', 'usdAmount']);
        if (!Number.isFinite(price) && Number.isFinite(toAmountUsd) && fromAmount !== null) {
            const decimals = Number.isFinite(fromDecimals) ? fromDecimals : 0;
            const fromNumeric = Number(fromAmount);
            if (Number.isFinite(fromNumeric) && fromNumeric > 0) {
                const scale = Math.pow(10, decimals);
                price = (toAmountUsd / fromNumeric) * scale;
            }
        }

        if (!Number.isFinite(price)) {
            price = null;
        }

        return {
            price,
            fromDecimals,
            toDecimals,
            fromAmount,
            toAmount,
            tokenUnitPrices: tokenPrices,
            quotePrice: Number.isFinite(directPrice) ? Number(directPrice) : null,
            amountPrice: Number.isFinite(priceFromAmounts) ? priceFromAmounts : null
        };
    }

    return {
        callOkxDexEndpoint,
        collectChainSearchKeys,
        collectTxhashChainEntries,
        dedupeOkxChainEntries,
        ensureOkxChainDirectory,
        okxJsonRequest,
        fetchJsonWithTimeout,
        ensureQueryChainParams,
        findChainEntryByIndex,
        normalizeOkxConfigAddress,
        normalizeOkxChainDirectoryEntry,
        normalizeOkxChainEntry,
        normalizeChainKey,
        unwrapOkxData,
        unwrapOkxFirst,
        normalizeNumeric,
        tokenDecimalsCache,
        okxTokenDirectoryCache,
        okxResolvedChainCache,
        getOkxChainShortNameCandidates,
        resolveChainContextShortName,
        resolveOkxChainContext,
        buildOkxDexQuery,
        sortTxhashChainEntries,
        computeOkxQuoteLiquidityScore,
        computePriceFromTokenAmounts,
        extractOkxPriceValue,
        extractOkxQuotePrice,
        fetchOkxDexBalanceSnapshot,
        fetchOkxDexWalletHoldings,
        fetchOkxSupportedChains,
        fetchOkxBalanceSupportedChains,
        fetchOkx402Supported,
        fetchOkxTxhashDetail,
        fetchOkxTopTokenList,
        resolveTopTokenChainEntry,
        fetchBanmaoQuoteSnapshot,
        fetchBanmaoPrice,
        fetchBanmaoMarketSnapshot,
        fetchBanmaoMarketSnapshotForChain,
        fetchTokenMarketSnapshot,
        fetchTokenMarketSnapshotForChain,
        fetchTokenPriceOverview,
        fetchBanmaoTokenProfile,
        getBanmaoTokenDecimals,
        resolveTokenDecimals,
        normalizeOkxTokenAddress,
        collectOkxTokenUnitPrices,
        summarizeOkxQuoteRoute,
        resolveOkbUsdPrice,
        selectOkxQuoteByLiquidity,
        normalizeDecimalsCandidate,
        pickOkxNumeric,
        tryFetchOkxMarketTicker,
        BANMAO_DECIMALS_DEFAULT,
        BANMAO_DECIMALS_CACHE_TTL,
        getChainDirectoryCache: () => ({
            okxChainDirectoryCache,
            okxChainDirectoryExpiresAt,
            okxChainDirectoryPromise
        }),
        setChainDirectoryCache: (cacheValue, expiresAt, promise = null) => {
            okxChainDirectoryCache = cacheValue;
            okxChainDirectoryExpiresAt = expiresAt;
            okxChainDirectoryPromise = promise;
        },
        getBanmaoDecimalsCache: () => ({ banmaoDecimalsCache, banmaoDecimalsFetchedAt }),
        setBanmaoDecimalsCache: (value, fetchedAt) => {
            banmaoDecimalsCache = value;
            banmaoDecimalsFetchedAt = fetchedAt;
        }
    };
}

module.exports = createOkxService;
