import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Activity, ArrowDown, ArrowUp, BarChart3, Boxes, Check, ChevronDown, CircleAlert,
    Copy, ExternalLink, Gauge, KeyRound, Link2, Loader2, Pencil, Plus, RefreshCw, Save,
    Trash2, Unplug, X
} from 'lucide-react';
import api from '@/api/client';
import { resolveProviderIcon } from './providerIcon';

const SECTIONS = [
    { id: 'providers', icon: KeyRound, key: 'providers' },
    { id: 'combos', icon: Boxes, key: 'combos' },
    { id: 'endpoint', icon: Link2, key: 'endpoint' },
    { id: 'usage', icon: BarChart3, key: 'usage' },
    { id: 'quota', icon: Gauge, key: 'quota' },
];

const FEATURED_PROVIDER_IDS = ['codex', 'claude', 'gemini-cli', 'grok-cli', 'github', 'antigravity', 'kiro'];
const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER_ID_ALIASES = Object.freeze({ gcli: 'grok-cli', gb: 'grok-cli', 'grok-build': 'grok-cli' });

function canonicalProviderId(value) {
    const id = String(value || '').toLowerCase();
    return PROVIDER_ID_ALIASES[id] || id;
}

function connectionHealth(connection) {
    if (connection?.isActive === false) return 'error';
    const status = String(connection?.testStatus || '').toLowerCase();
    if (['error', 'expired', 'unavailable', 'failed'].includes(status)) return 'error';
    const expiresAt = new Date(connection?.expiresAt || 0).getTime();
    if (expiresAt && expiresAt <= Date.now()) return 'error';
    if (expiresAt && expiresAt - Date.now() <= EXPIRING_SOON_MS) return 'expiring';
    return 'active';
}

const healthBadgeClass = health => health === 'active'
    ? 'badge badge-success text-[8px]'
    : health === 'expiring'
        ? 'badge bg-amber-500/15 text-[8px] text-amber-300'
        : 'badge badge-danger text-[8px]';

const api9r = async (path, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (['GET', 'HEAD'].includes(method)) return api.request(`/ai/9router${path}`, options);
    const csrf = await api.request('/ai/9router/csrf', { cacheTtl: 0 });
    return api.request(`/ai/9router${path}`, {
        ...options,
        headers: { ...(options.headers || {}), 'X-CSRF-Token': csrf.csrfToken }
    });
};

function ProviderIcon({ provider, size = 24 }) {
    const resolved = resolveProviderIcon(provider);
    const [failed, setFailed] = useState(false);
    const label = provider?.name || provider?.id || '';
    const showAsset = resolved.kind === 'asset' && resolved.src && !failed;
    return (
        <span
            className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/90 font-bold text-brand-700 ring-1 ring-black/10 dark:bg-surface-100/90"
            style={{ width: size, height: size, fontSize: Math.max(9, Math.floor(size * 0.38)) }}
            title={label}
        >
            {showAsset ? (
                <img
                    src={resolved.src}
                    alt=""
                    aria-hidden="true"
                    width={size}
                    height={size}
                    className="h-full w-full object-contain p-0.5"
                    onError={() => setFailed(true)}
                />
            ) : (
                <span aria-hidden="true">{resolved.text}</span>
            )}
        </span>
    );
}

function safeExternalUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
        return '';
    }
}

function EmptyState({ icon: Icon, title, description }) {
    return (
        <div className="glass-card p-5 text-center">
            <Icon size={32} className="mx-auto text-surface-200/30" />
            <p className="mt-3 text-xs font-semibold text-surface-100">{title}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-surface-200/45">{description}</p>
        </div>
    );
}

function ErrorState({ retry }) {
    const { t } = useTranslation();
    return (
        <div className="glass-card p-3" role="alert">
            <div className="flex items-start gap-2 text-surface-100">
                <CircleAlert size={16} className="mt-0.5 shrink-0 text-surface-200/60" />
                <p className="text-[11px] leading-relaxed">
                    {t('dashboard.chatPage.nineRouterSafeError', '9Router is temporarily unavailable. Your credentials remain private. Please try again.')}
                </p>
            </div>
            {retry && (
                <button type="button" onClick={retry} className="btn-secondary mt-3 text-[10px]">
                    <RefreshCw size={14} /> {t('dashboard.chatPage.retryAction', 'Retry')}
                </button>
            )}
        </div>
    );
}

const formatNumber = value => Number(value || 0).toLocaleString();
const formatCost = value => Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });

function ModelMetadata({ model, compact = false }) {
    const capabilities = Object.entries(model?.capabilities || {}).filter(([, enabled]) => enabled === true).map(([name]) => name);
    const context = Number(model?.contextLength || model?.context_window || model?.contextWindow || 0);
    const output = Number(model?.maxOutputTokens || model?.max_output_tokens || 0);
    return (
        <span className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-1.5'}`}>
            {context > 0 && <span className="badge badge-info text-[8px]">{formatNumber(context)} ctx</span>}
            {output > 0 && <span className="badge badge-info text-[8px]">{formatNumber(output)} out</span>}
            {(model?.category || model?.kind) && <span className="badge text-[8px]">{model.category || model.kind}</span>}
            {capabilities.slice(0, compact ? 3 : 5).map(capability => <span key={capability} className="badge badge-success text-[8px]">{capability}</span>)}
        </span>
    );
}

function modelCapabilityBadges(model) {
    const names = Object.entries(model?.capabilities || {}).filter(([, enabled]) => enabled === true).map(([name]) => name.toLowerCase());
    return {
        vision: names.some(name => /vision|image|multimodal/.test(name)),
        reasoning: names.some(name => /reason|thinking/.test(name))
    };
}

function Providers({ onChanged }) {
    const { t } = useTranslation();
    const [connections, setConnections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [catalog, setCatalog] = useState({ providers: [] });
    const [providerSearch, setProviderSearch] = useState('');
    const [providerStatusFilter, setProviderStatusFilter] = useState('needs-action');
    const [deviceLogin, setDeviceLogin] = useState(null);
    const [redirectLogin, setRedirectLogin] = useState(null);
    const [manualLogin, setManualLogin] = useState(null);
    const [proxyLogin, setProxyLogin] = useState(null);
    const [manualInput, setManualInput] = useState('');
    const [secretLogin, setSecretLogin] = useState(null);
    const [secretInput, setSecretInput] = useState('');
    const [cursorMachineId, setCursorMachineId] = useState('');
    const [secretAcknowledged, setSecretAcknowledged] = useState(false);
    const [freeLogin, setFreeLogin] = useState(null);
    const pollTimer = useRef(null);
    const mounted = useRef(true);
    const [form, setForm] = useState({
        provider: 'openai-compatible', name: '', apiKey: '',
        baseUrl: '', prefix: 'custom', apiType: 'chat'
    });
    const [connectionTest, setConnectionTest] = useState(null);
    const [connectionActions, setConnectionActions] = useState({});
    const [connectionModels, setConnectionModels] = useState({});
    const [modelTestResults, setModelTestResults] = useState({});
    const [expandedConnection, setExpandedConnection] = useState('');
    const [showMoreProviders, setShowMoreProviders] = useState(false);
    const [refreshingAll, setRefreshingAll] = useState(false);
    const isCompatible = form.provider === 'openai-compatible';

    useEffect(() => () => {
        if (pollTimer.current) clearTimeout(pollTimer.current);
    }, []);

    const validateCompatible = useCallback(async () => {
        if (!form.baseUrl.trim() || !form.apiKey.trim()) return false;
        setConnectionTest({ status: 'testing' });
        try {
            const result = await api9r('/provider-nodes/validate', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'openai-compatible',
                    baseUrl: form.baseUrl.trim(),
                    apiKey: form.apiKey.trim()
                })
            });
            const valid = result?.valid === true;
            setConnectionTest({ status: valid ? 'success' : 'failed' });
            return valid;
        } catch {
            setConnectionTest({ status: 'unreachable' });
            return false;
        }
    }, [form.apiKey, form.baseUrl]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [data, providerCatalog] = await Promise.all([
                api9r('/providers'),
                api9r('/providers/catalog')
            ]);
            setConnections(data.connections || data.providers || (Array.isArray(data) ? data : []));
            setCatalog({ providers: providerCatalog.providers || [] });
        } catch {
            setError('request_failed');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
            setManualInput('');
            setManualLogin(null);
            if (pollTimer.current) clearTimeout(pollTimer.current);
            pollTimer.current = null;
        };
    }, [load]);

    const pollDeviceLogin = useCallback(async (provider, deviceData, deadline) => {
        if (Date.now() >= deadline) {
            setDeviceLogin(current => current?.provider === provider ? { ...current, status: 'expired' } : current);
            return;
        }
        try {
            const result = await api9r(`/oauth/${provider}/poll`, {
                method: 'POST',
                body: JSON.stringify({
                    deviceCode: deviceData.device_code,
                    codeVerifier: deviceData.codeVerifier,
                    extraData: provider === 'kiro' ? {
                        _clientId: deviceData._clientId,
                        _clientSecret: deviceData._clientSecret,
                        _region: deviceData._region,
                        _authMethod: deviceData._authMethod,
                        _startUrl: deviceData._startUrl
                    } : provider === 'qoder' ? {
                        _qoderNonce: deviceData._qoderNonce,
                        _qoderMachineId: deviceData._qoderMachineId,
                        _qoderVerifier: deviceData.codeVerifier
                    } : undefined
                })
            });
            if (result?.success) {
                setDeviceLogin({ provider, status: 'connected' });
                await load();
                onChanged?.();
                return;
            }
            if (!result?.pending) {
                setDeviceLogin({ provider, status: 'failed' });
                return;
            }
        } catch {
            setDeviceLogin({ provider, status: 'failed' });
            return;
        }
        pollTimer.current = setTimeout(
            () => pollDeviceLogin(provider, deviceData, deadline),
            Math.max(3000, Number(deviceData.interval || 5) * 1000)
        );
    }, [load, onChanged]);

    const pollRedirectLogin = useCallback(async (provider, statusToken, deadline) => {
        if (!mounted.current) return;
        if (Date.now() >= deadline) {
            setRedirectLogin({ provider, status: 'expired' });
            return;
        }
        try {
            const result = await api9r(`/oauth/status/${encodeURIComponent(statusToken)}`);
            if (!mounted.current) return;
            if (result.status === 'connected') {
                setRedirectLogin({ provider, status: 'connected' });
                await load();
                onChanged?.();
                return;
            }
            if (['failed', 'denied', 'expired'].includes(result.status)) {
                setRedirectLogin({ provider, status: result.status });
                return;
            }
        } catch {
            setRedirectLogin({ provider, status: 'failed' });
            return;
        }
        if (mounted.current) pollTimer.current = setTimeout(() => pollRedirectLogin(provider, statusToken, deadline), 2000);
    }, [load, onChanged]);

    const pollProxyLogin = useCallback(async (provider, state, deadline) => {
        if (!mounted.current) return;
        if (Date.now() >= deadline) {
            setProxyLogin({ provider, state, status: 'expired' });
            return;
        }
        try {
            const result = await api9r(`/providers/oauth/poll-status?provider=${encodeURIComponent(provider)}&state=${encodeURIComponent(state)}`);
            if (!mounted.current) return;
            if (result.status === 'done') {
                setProxyLogin({ provider, state, status: 'connected' });
                await load();
                onChanged?.();
                return;
            }
            if (result.status === 'error') {
                setProxyLogin({ provider, state, status: 'failed', error: result.error });
                return;
            }
        } catch {
            setProxyLogin({ provider, state, status: 'failed' });
            return;
        }
        if (mounted.current) pollTimer.current = setTimeout(() => pollProxyLogin(provider, state, deadline), 1500);
    }, [load, onChanged]);

    const filterProviders = useCallback(providers => {
        const query = providerSearch.trim().toLowerCase();
        const connectedIds = new Set(connections.filter(connection => connectionHealth(connection) !== 'error').map(connection => canonicalProviderId(connection.provider)));
        return providers.filter(provider => {
            const connected = connectedIds.has(canonicalProviderId(provider.id));
            const unavailable = provider.connection?.action === 'unavailable';
            if (providerStatusFilter === 'connected' && !connected) return false;
            if (providerStatusFilter === 'needs-action' && (connected || unavailable)) return false;
            if (providerStatusFilter === 'unavailable' && !unavailable) return false;
            return !query || `${provider.name || ''} ${provider.id || ''} ${(provider.aliases || []).join(' ')}`.toLowerCase().includes(query);
        });
    }, [connections, providerSearch, providerStatusFilter]);
    const providersByCapability = useMemo(() => ({
        apiKey: catalog.providers.filter(provider => provider.connection?.action === 'api_key'),
        deviceCode: catalog.providers.filter(provider => provider.connection?.action === 'device_code'),
        oauthRedirect: catalog.providers.filter(provider => provider.connection?.action === 'oauth_redirect'),
        manualCode: catalog.providers.filter(provider => provider.connection?.action === 'manual_code'),
        manualCallback: catalog.providers.filter(provider => provider.connection?.action === 'manual_callback' || provider.connection?.fallback?.action === 'manual_callback'),
        manualSecret: catalog.providers.filter(provider => provider.connection?.action === 'manual_secret'),
        freeConnection: catalog.providers.filter(provider => provider.connection?.action === 'free_connection'),
        serviceProbe: catalog.providers.filter(provider => provider.connection?.action === 'service_probe'),
        unavailable: catalog.providers.filter(provider => provider.connection?.action === 'unavailable')
    }), [catalog.providers]);
    const visibleApiKeyProviders = useMemo(() => filterProviders(providersByCapability.apiKey), [filterProviders, providersByCapability.apiKey]);
    const visibleDeviceProviders = useMemo(() => filterProviders(providersByCapability.deviceCode), [filterProviders, providersByCapability.deviceCode]);
    const visibleRedirectProviders = useMemo(() => filterProviders(providersByCapability.oauthRedirect), [filterProviders, providersByCapability.oauthRedirect]);
    const visibleManualProviders = useMemo(() => filterProviders([...providersByCapability.manualCode, ...providersByCapability.manualCallback]), [filterProviders, providersByCapability.manualCode, providersByCapability.manualCallback]);
    const visibleSecretProviders = useMemo(() => filterProviders(providersByCapability.manualSecret), [filterProviders, providersByCapability.manualSecret]);
    const visibleFreeProviders = useMemo(() => filterProviders(providersByCapability.freeConnection), [filterProviders, providersByCapability.freeConnection]);
    const visibleProbeProviders = useMemo(() => filterProviders(providersByCapability.serviceProbe), [filterProviders, providersByCapability.serviceProbe]);
    const visibleUnavailableProviders = useMemo(() => filterProviders(providersByCapability.unavailable), [filterProviders, providersByCapability.unavailable]);
    const featuredProviders = useMemo(() => FEATURED_PROVIDER_IDS
        .map(id => catalog.providers.find(provider => provider.id === id || provider.alias === id || provider.aliases?.includes(id)))
        .filter(Boolean), [catalog.providers]);
    const connectedProviderIds = useMemo(() => new Set(connections
        .filter(connection => connectionHealth(connection) !== 'error')
        .map(connection => canonicalProviderId(connection.provider))), [connections]);
    const healthSummary = useMemo(() => connections.reduce((summary, connection) => {
        summary[connectionHealth(connection)] += 1;
        return summary;
    }, { active: 0, expiring: 0, error: 0 }), [connections]);

    const selectApiKeyProvider = provider => {
        setForm(current => ({ ...current, provider: provider.id }));
        setConnectionTest(null);
    };

    const unavailableReason = reason => ({
        configuration_required: t('dashboard.chatPage.oauthConfigurationRequired', 'Server Google OAuth web client configuration is required.'),
        manual_code_exchange_only: t('dashboard.chatPage.manualCodeExchangeOnly', 'This provider supports manual code exchange only; public redirect login is disabled.'),
        credential_in_callback_url_not_allowed: t('dashboard.chatPage.credentialInCallbackUrlNotAllowed', 'This provider can put credentials in the callback URL, so public login is blocked.'),
        local_token_import_only: t('dashboard.chatPage.localTokenImportOnly', 'This provider supports local token import only.'),
        loopback_redirect_registration_required: t('dashboard.chatPage.loopbackRedirectRequired', 'This provider requires a registered loopback callback and cannot use xBot public login.'),
        secure_cookie_capture_not_supported: t('dashboard.chatPage.secureCookieCaptureNotSupported', 'Secure cookie capture is not supported. Use the provider’s official API variant instead.'),
        no_account_authentication_flow: t('dashboard.chatPage.noAccountAuthenticationFlow', 'This free endpoint has no account connection flow and cannot bypass connection-based model discovery.'),
        local_callback_infrastructure_required: t('dashboard.chatPage.localCallbackRequired', 'Local callback required'),
        public_redirect_callback_required: t('dashboard.chatPage.publicCallbackRequired', 'Public redirect callback required'),
        cookie_capture_infrastructure_required: t('dashboard.chatPage.cookieCaptureRequired', 'Secure cookie capture is not available'),
        no_official_export_validation_path: t('dashboard.chatPage.noOfficialExportValidationPath', 'No official user-facing export and validation path is available.'),
        manual_session_cookie_import_not_approved: t('dashboard.chatPage.manualCookieImportBlocked', 'Manual subscription-cookie import remains blocked. Use the provider’s official API instead.'),
        upstream_free_service_ended: t('dashboard.chatPage.upstreamFreeEnded', 'The upstream free service has ended.'),
        unsupported_auth_flow: t('dashboard.chatPage.unsupportedAuthFlow', 'This authentication flow is not supported')
    }[reason] || t('dashboard.chatPage.unsupportedAuthFlow', 'This authentication flow is not supported'));

    const startRedirectLogin = async provider => {
        if (pollTimer.current) clearTimeout(pollTimer.current);
        setError('');
        setRedirectLogin({ provider, status: 'starting' });
        const popup = window.open('', '_blank', 'noopener,noreferrer');
        if (!popup) {
            setRedirectLogin({ provider, status: 'popup_blocked' });
            return;
        }
        try {
            const data = await api9r(`/oauth/${provider}/start`, {
                method: 'POST',
                body: JSON.stringify({ returnTarget: '/xBot/?section=providers' })
            });
            const authorizationUrl = safeExternalUrl(data.authorizationUrl);
            if (!authorizationUrl || !data.statusToken) throw new Error('oauth_start_invalid');
            popup.location.replace(authorizationUrl);
            setRedirectLogin({ provider, status: 'pending' });
            const lifetimeMs = Math.max(30, Number(data.expiresIn || 300)) * 1000;
            pollTimer.current = setTimeout(
                () => pollRedirectLogin(provider, data.statusToken, Date.now() + lifetimeMs),
                2000
            );
        } catch (oauthError) {
            popup.close();
            const code = String(oauthError?.message || oauthError?.code || '');
            setRedirectLogin({
                provider,
                status: code.includes('OAUTH_CONFIGURATION_REQUIRED') ? 'configuration_required' : 'failed'
            });
        }
    };

    const startDeviceLogin = async provider => {
        if (pollTimer.current) clearTimeout(pollTimer.current);
        setError('');
        setDeviceLogin({ provider, status: 'starting' });
        try {
            const data = await api9r(`/oauth/${provider}/device-code`);
            const verificationUrl = safeExternalUrl(data.verification_uri_complete || data.verification_uri);
            if (!data.device_code || !verificationUrl) throw new Error('device_login_unavailable');
            setDeviceLogin({
                provider,
                status: 'waiting',
                userCode: data.user_code || '',
                verificationUrl
            });
            window.open(verificationUrl, '_blank', 'noopener,noreferrer');
            const lifetimeMs = Math.max(60, Number(data.expires_in || 600)) * 1000;
            pollTimer.current = setTimeout(
                () => pollDeviceLogin(provider, data, Date.now() + lifetimeMs),
                Math.max(3000, Number(data.interval || 5) * 1000)
            );
        } catch {
            setDeviceLogin({ provider, status: 'failed' });
        }
    };

    const startManualLogin = async provider => {
        setError('');
        setManualInput('');
        setManualLogin({ provider: provider.id, action: provider.connection.action, status: 'starting' });
        const popup = window.open('', '_blank', 'noopener,noreferrer');
        if (!popup) {
            setManualLogin({ provider: provider.id, action: provider.connection.action, status: 'failed' });
            return;
        }
        try {
            const data = await api9r('/providers/oauth/start-proxy', {
                method: 'POST', body: JSON.stringify({ provider: provider.id })
            });
            const authorizationUrl = safeExternalUrl(data.authorizationUrl);
            if (!authorizationUrl || !data.sessionToken) throw new Error('manual_start_invalid');
            popup.location.replace(authorizationUrl);
            if (data.proxyAvailable && data.state && data.pollEndpoint) {
                setManualLogin(null);
                setProxyLogin({ provider: provider.id, state: data.state, status: 'waiting' });
                const lifetimeMs = Math.max(30, Number(data.expiresIn || 300)) * 1000;
                pollTimer.current = setTimeout(
                    () => pollProxyLogin(provider.id, data.state, Date.now() + lifetimeMs),
                    1000
                );
                return;
            }
            setManualLogin({
                provider: provider.id,
                action: provider.connection.action,
                status: 'waiting',
                sessionToken: data.sessionToken,
            });
        } catch {
            popup.close();
            setManualLogin({ provider: provider.id, action: provider.connection.action, status: 'failed' });
        }
    };

    const cancelProxyLogin = async () => {
        const current = proxyLogin;
        if (!current?.provider || !current?.state) return;
        if (pollTimer.current) clearTimeout(pollTimer.current);
        pollTimer.current = null;
        setProxyLogin(null);
        try {
            await api9r('/providers/oauth/stop-proxy', {
                method: 'POST', body: JSON.stringify({ provider: current.provider, state: current.state })
            });
        } catch { /* best-effort cleanup; server TTL remains authoritative */ }
    };

    const completeManualLogin = async event => {
        event.preventDefault();
        if (!manualLogin?.sessionToken || !manualInput.trim()) return;
        const input = manualInput.trim();
        setManualInput('');
        setManualLogin(current => ({ ...current, status: 'exchanging' }));
        try {
            await api9r(`/oauth/${manualLogin.provider}/manual-complete`, {
                method: 'POST',
                body: JSON.stringify({ sessionToken: manualLogin.sessionToken, input })
            });
            setManualLogin(current => ({ provider: current.provider, action: current.action, status: 'connected' }));
            await load();
            onChanged?.();
        } catch {
            setManualLogin(current => ({ provider: current.provider, action: current.action, status: 'failed' }));
        }
    };

    const openSecretImport = provider => {
        setSecretInput('');
        setCursorMachineId('');
        setSecretAcknowledged(false);
        setSecretLogin({ provider, status: 'waiting' });
    };

    const submitSecretImport = async event => {
        event.preventDefault();
        if (!secretLogin?.provider || !secretAcknowledged || !secretInput.trim()) return;
        const provider = secretLogin.provider;
        const input = provider.id === 'cursor'
            ? { accessToken: secretInput.trim(), machineId: cursorMachineId.trim() }
            : secretInput.trim();
        setSecretInput('');
        setCursorMachineId('');
        setSecretLogin(current => ({ ...current, status: 'validating' }));
        try {
            await api9r(`/oauth/${provider.id}/manual-secret`, {
                method: 'POST', body: JSON.stringify({ input })
            });
            setSecretLogin({ provider, status: 'connected' });
            await load();
            onChanged?.();
        } catch (importError) {
            setSecretLogin({ provider, status: importError?.code === 'PROVIDER_CREDENTIAL_EXPIRED' ? 'expired' : 'failed' });
        }
    };

    const enableFree = async provider => {
        setFreeLogin({ provider: provider.id, status: 'starting' });
        try {
            await api9r(`/oauth/${provider.id}/free-enable`, { method: 'POST', body: JSON.stringify({}) });
            setFreeLogin({ provider: provider.id, status: 'connected' });
            await load();
            onChanged?.();
        } catch {
            setFreeLogin({ provider: provider.id, status: 'failed' });
        }
    };

    const probeService = async provider => {
        setFreeLogin({ provider: provider.id, status: 'probing' });
        try {
            await api9r(`/oauth/${provider.id}/service-probe`, { method: 'POST', body: JSON.stringify({}) });
            setFreeLogin({ provider: provider.id, status: 'available' });
        } catch (probeError) {
            setFreeLogin({ provider: provider.id, status: probeError?.code === 'UPSTREAM_SERVICE_ENDED' ? 'ended' : 'failed' });
        }
    };

    const startProviderConnection = provider => {
        const action = provider.connection?.action;
        if (action === 'device_code') return startDeviceLogin(provider.id);
        if (action === 'oauth_redirect') return startRedirectLogin(provider.id);
        if (['manual_code', 'manual_callback'].includes(action)) return startManualLogin(provider);
        if (action === 'manual_secret') return openSecretImport(provider);
        if (action === 'free_connection') return enableFree(provider);
        if (action === 'service_probe') return probeService(provider);
        if (action === 'api_key') return selectApiKeyProvider(provider);
    };

    const add = async event => {
        event.preventDefault();
        if (!form.apiKey.trim()) return;
        setSaving(true);
        setError('');
        try {
            let provider = form.provider;
            if (isCompatible) {
                const valid = await validateCompatible();
                if (!valid) return;
                const nodeResult = await api9r('/provider-nodes', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: form.name.trim() || 'OpenAI Compatible',
                        prefix: form.prefix.trim(),
                        apiType: form.apiType,
                        baseUrl: form.baseUrl.trim(),
                        type: 'openai-compatible'
                    })
                });
                provider = nodeResult?.node?.id;
                if (!provider) throw new Error('provider_node_unavailable');
            }
            await api9r('/providers', {
                method: 'POST',
                body: JSON.stringify({
                    provider,
                    authType: 'api_key',
                    name: form.name.trim() || undefined,
                    apiKey: form.apiKey.trim()
                })
            });
            setForm(current => ({ ...current, name: '', apiKey: '', baseUrl: '' }));
            setConnectionTest(null);
            await load();
            onChanged?.();
        } catch {
            setError('request_failed');
        } finally {
            setSaving(false);
        }
    };

    const remove = async id => {
        setError('');
        try {
            await api9r(`/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
            await load();
            onChanged?.();
        } catch {
            setError('request_failed');
        }
    };

    const testConnection = async connection => {
        setConnectionActions(current => ({ ...current, [connection.id]: 'testing' }));
        try {
            const result = await api9r(`/providers/${encodeURIComponent(connection.id)}/test`, { method: 'POST', body: JSON.stringify({}) });
            setConnectionActions(current => ({ ...current, [connection.id]: result?.valid ? 'valid' : 'invalid' }));
            await load();
        } catch {
            setConnectionActions(current => ({ ...current, [connection.id]: 'invalid' }));
        }
    };

    const refreshAll = async () => {
        if (refreshingAll || !connections.length) return;
        setRefreshingAll(true);
        setError('');
        try {
            await api9r('/providers/test-batch', { method: 'POST', body: JSON.stringify({ mode: 'all' }) });
            await load();
            onChanged?.();
        } catch {
            setError('request_failed');
        } finally {
            setRefreshingAll(false);
        }
    };

    const toggleModels = async connection => {
        if (expandedConnection === connection.id) {
            setExpandedConnection('');
            return;
        }
        setExpandedConnection(connection.id);
        if (connectionModels[connection.id]) return;
        setConnectionActions(current => ({ ...current, [connection.id]: 'models-loading' }));
        try {
            const result = await api9r(`/providers/${encodeURIComponent(connection.id)}/models`);
            setConnectionModels(current => ({ ...current, [connection.id]: result.models || [] }));
            setConnectionActions(current => ({ ...current, [connection.id]: '' }));
        } catch {
            setConnectionModels(current => ({ ...current, [connection.id]: [] }));
            setConnectionActions(current => ({ ...current, [connection.id]: 'models-error' }));
        }
    };

    const testAllModels = async connection => {
        setConnectionActions(current => ({ ...current, [connection.id]: 'models-testing' }));
        setModelTestResults(current => ({ ...current, [connection.id]: {} }));
        try {
            const result = await api9r(`/providers/${encodeURIComponent(connection.id)}/test-models`, {
                method: 'POST', body: JSON.stringify({})
            });
            setModelTestResults(current => ({
                ...current,
                [connection.id]: Object.fromEntries((result.results || []).map(item => [item.modelId, item]))
            }));
            setConnectionActions(current => ({ ...current, [connection.id]: 'models-tested' }));
        } catch {
            setConnectionActions(current => ({ ...current, [connection.id]: 'models-test-error' }));
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-brand-400" /></div>;

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-[10px] leading-relaxed text-surface-200/70">
                {t('dashboard.chatPage.nineRouterPrivateNotice', 'Each provider account is isolated to your Telegram account. Other users and bot owners cannot use it.')}
            </div>
            {error && <ErrorState retry={load} />}
            {catalog.providers.length > 0 && (
                <div className="glass-card space-y-3 p-3">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-emerald-500/10 p-2 text-center">
                            <p className="text-base font-bold text-emerald-300">{healthSummary.active}</p>
                            <p className="text-[8px] text-emerald-200/60">{t('dashboard.chatPage.connectedProviders', 'Connected')}</p>
                        </div>
                        <div className="rounded-lg bg-surface-900/35 p-2 text-center">
                            <p className="text-base font-bold text-surface-100">{catalog.providers.length}</p>
                            <p className="text-[8px] text-surface-200/45">{t('dashboard.chatPage.availableProviders', 'Available')}</p>
                        </div>
                        <div className={`rounded-lg p-2 text-center ${healthSummary.expiring || healthSummary.error ? 'bg-amber-500/10' : 'bg-surface-900/35'}`}>
                            <p className={`text-base font-bold ${healthSummary.expiring || healthSummary.error ? 'text-amber-300' : 'text-surface-100'}`}>{healthSummary.expiring + healthSummary.error}</p>
                            <p className="text-[8px] text-surface-200/45">{t('dashboard.chatPage.connectionsNeedAttention', 'Need attention')}</p>
                        </div>
                    </div>
                    <button type="button" onClick={refreshAll} disabled={refreshingAll || !connections.length} className="btn-secondary w-full text-xs">
                        <RefreshCw size={14} className={refreshingAll ? 'animate-spin' : ''} />
                        {t('dashboard.chatPage.refreshAllConnections', 'Refresh all connections')}
                    </button>
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-200/45">
                            {t('dashboard.chatPage.providerAccountLogin', 'Provider account login')}
                        </p>
                        <p className="mt-1 text-[10px] text-surface-200/45">
                            {t('dashboard.chatPage.providerAccountLoginDesc', 'Sign in on the provider website. xBot stores the resulting connection only in your tenant-scoped server vault.')}
                        </p>
                    </div>
                    <input
                        type="search"
                        value={providerSearch}
                        onChange={event => setProviderSearch(event.target.value)}
                        placeholder={t('dashboard.chatPage.providerSearch', 'Search providers')}
                        className="input-field w-full text-xs"
                    />
                    <div className="grid grid-cols-3 gap-1" role="group" aria-label={t('dashboard.chatPage.providerStatusFilter', 'Provider status filter')}>
                        {[
                            ['connected', t('dashboard.chatPage.connectedProviders', 'Connected')],
                            ['needs-action', t('dashboard.chatPage.connectionsNeedAttention', 'Needs action')],
                            ['unavailable', t('dashboard.chatPage.unavailable', 'Unavailable')]
                        ].map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setProviderStatusFilter(value)} aria-pressed={providerStatusFilter === value} className={`rounded-lg px-2 py-2 text-[9px] ${providerStatusFilter === value ? 'bg-brand-500/20 text-brand-200' : 'bg-surface-900/30 text-surface-200/45 hover:bg-white/5'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {!providerSearch && featuredProviders.length > 0 && (
                        <div className="space-y-2">
                            <div>
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-brand-300">{t('dashboard.chatPage.featuredProviders', 'Featured providers')}</p>
                                <p className="text-[9px] text-surface-200/40">{t('dashboard.chatPage.featuredProvidersDesc', 'Popular choices that unlock more models in Chat AI.')}</p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {featuredProviders.map(provider => {
                                    const connected = connectedProviderIds.has(canonicalProviderId(provider.id));
                                    return (
                                        <button key={provider.id} type="button" onClick={() => !connected && startProviderConnection(provider)} disabled={connected || provider.connection?.action === 'unavailable'} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-surface-900/30 p-3 text-left transition-colors hover:border-brand-500/25 hover:bg-brand-500/5 disabled:cursor-default disabled:opacity-70">
                                            <ProviderIcon provider={provider} size={34} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-semibold text-surface-100">{provider.name}</span>
                                                <span className="block text-[9px] text-surface-200/40">{connected ? t('dashboard.chatPage.active', 'Active') : t('dashboard.chatPage.connect', 'Connect')}</span>
                                            </span>
                                            <span className={connected ? 'badge badge-success text-[8px]' : 'badge badge-info text-[8px]'}>{connected ? t('dashboard.chatPage.connected', 'Connected') : t('dashboard.chatPage.connect', 'Connect')}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {visibleRedirectProviders.length > 0 && <p className="text-[9px] font-semibold uppercase tracking-wide text-surface-200/40">{t('dashboard.chatPage.secureOAuth', 'Secure OAuth')}</p>}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {visibleRedirectProviders.map(provider => (
                            <button
                                key={provider.id}
                                type="button"
                                onClick={() => startRedirectLogin(provider.id)}
                                disabled={['starting', 'pending'].includes(redirectLogin?.status)}
                                className="btn-secondary min-w-0 justify-start text-xs"
                            >
                                {redirectLogin?.provider === provider.id && ['starting', 'pending'].includes(redirectLogin.status)
                                    ? <Loader2 size={15} className="shrink-0 animate-spin" />
                                    : <KeyRound size={15} className="shrink-0" />}
                                <span className="truncate">{provider.name || provider.id}</span>
                            </button>
                        ))}
                    </div>
                    {redirectLogin?.status === 'pending' && <p className="text-[10px] text-brand-300" role="status">{t('dashboard.chatPage.oauthPending', 'Complete sign-in in the provider tab. xBot is waiting securely.')}</p>}
                    {redirectLogin?.status === 'connected' && <p className="text-[10px] text-emerald-300" role="status">{t('dashboard.chatPage.oauthConnected', 'Provider connected. Catalog and models were refreshed.')}</p>}
                    {redirectLogin?.status === 'popup_blocked' && (
                        <p className="text-[10px] text-amber-300" role="alert">
                            {t('dashboard.chatPage.oauthPopupBlocked', 'The sign-in window was blocked. Allow popups for xBot and try again.')}
                        </p>
                    )}
                    {redirectLogin?.status === 'configuration_required' && <p className="text-[10px] text-amber-300" role="alert">{unavailableReason('configuration_required')}</p>}
                    {['failed', 'denied', 'expired'].includes(redirectLogin?.status) && <p className="text-[10px] text-red-300" role="alert">{t(`dashboard.chatPage.oauth_${redirectLogin.status}`, 'Provider sign-in did not complete. Please try again.')}</p>}
                    {visibleDeviceProviders.length > 0 && (
                        <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-surface-200/40">{t('dashboard.chatPage.oneClickLogin', 'One-click login')}</p>
                            <p className="text-[9px] text-surface-200/35">{t('dashboard.chatPage.oneClickLoginDesc', 'Click once, then approve on the provider website.')}</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {visibleDeviceProviders.map(provider => (
                            <button
                                key={provider.id}
                                type="button"
                                onClick={() => startDeviceLogin(provider.id)}
                                disabled={deviceLogin?.status === 'starting' || deviceLogin?.status === 'waiting'}
                                className="btn-secondary min-w-0 justify-start text-xs"
                            >
                                {deviceLogin?.provider === provider.id && ['starting', 'waiting'].includes(deviceLogin.status)
                                    ? <Loader2 size={15} className="shrink-0 animate-spin" />
                                    : <KeyRound size={15} className="shrink-0" />}
                                <span className="truncate">{provider.name || provider.id}</span>
                            </button>
                        ))}
                    </div>
                    {visibleManualProviders.length > 0 && (
                        <div className="space-y-2 border-t border-white/5 pt-2">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-surface-200/40">
                                {t('dashboard.chatPage.manualProviderLogin', 'Manual code or loopback callback')}
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {visibleManualProviders.map(provider => (
                                    <button key={provider.id} type="button" onClick={() => startManualLogin(provider)} className="btn-secondary min-w-0 justify-start text-xs">
                                        <ProviderIcon provider={provider} />
                                        <span className="truncate">{provider.name || provider.id}</span>
                                    </button>
                                ))}
                            </div>
                            {proxyLogin?.status === 'waiting' && (
                                <div className="space-y-2 rounded-lg border border-brand-500/20 bg-brand-500/10 p-3" role="status">
                                    <p className="text-[10px] text-brand-200">{t('dashboard.chatPage.oauthPending', 'Waiting for authorization…')}</p>
                                    <button type="button" className="btn-secondary w-full text-xs" onClick={cancelProxyLogin}>{t('dashboard.common.cancel', 'Cancel')}</button>
                                </div>
                            )}
                            {proxyLogin?.status === 'connected' && <p className="text-[10px] text-emerald-300" role="status">{t('dashboard.chatPage.oauthConnected', 'Provider connected. Catalog and models were refreshed.')}</p>}
                            {['failed', 'expired'].includes(proxyLogin?.status) && <p className="text-[10px] text-red-300" role="alert">{proxyLogin.error || t('dashboard.chatPage.manualLoginFailed', 'Provider authorization did not complete. Retry; manual callback remains available if the local port is busy.')}</p>}
                            {manualLogin?.status === 'waiting' && (
                                <form onSubmit={completeManualLogin} className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                                    <p className="text-[10px] text-amber-200/80">
                                        {manualLogin.action === 'manual_callback'
                                            ? t('dashboard.chatPage.pasteLoopbackCallback', 'After consent, paste only the full http://localhost:1455/auth/callback URL shown by your browser.')
                                            : t('dashboard.chatPage.pasteManualCode', 'Paste only the short authorization code issued by Claude. Do not paste a token or cookie.')}
                                    </p>
                                    <input
                                        type="password"
                                        autoComplete="off"
                                        value={manualInput}
                                        onChange={event => setManualInput(event.target.value)}
                                        className="input-field w-full font-mono text-xs"
                                        placeholder={manualLogin.action === 'manual_callback' ? 'http://localhost:1455/auth/callback?code=…&state=…' : t('dashboard.chatPage.authorizationCode', 'Authorization code')}
                                    />
                                    <div className="flex gap-2">
                                        <button type="submit" className="btn-primary flex-1 text-xs" disabled={!manualInput.trim()}>{t('dashboard.chatPage.connect', 'Connect')}</button>
                                        <button type="button" className="btn-secondary flex-1 text-xs" onClick={() => { setManualInput(''); setManualLogin(null); }}>{t('dashboard.common.cancel', 'Cancel')}</button>
                                    </div>
                                </form>
                            )}
                            {manualLogin?.status === 'connected' && <p className="text-[10px] text-emerald-300" role="status">{t('dashboard.chatPage.oauthConnected', 'Provider connected. Catalog and models were refreshed.')}</p>}
                            {manualLogin?.status === 'failed' && <p className="text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.manualLoginFailed', 'Manual authorization did not complete. Restart the flow; the prior code cannot be replayed.')}</p>}
                        </div>
                    )}
                    {visibleSecretProviders.length > 0 && (
                        <div className="space-y-2 border-t border-white/5 pt-2">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-surface-200/40">
                                {t('dashboard.chatPage.importCredentials', 'Import credentials')}
                            </p>
                            <p className="text-[10px] text-amber-200/70">
                                {t('dashboard.chatPage.sensitiveCredentialImportDesc', 'Copy only the exact upstream token or cookie value. xBot sends it once in the POST body, validates it server-side, and stores it encrypted for your tenant.')}
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {visibleSecretProviders.map(provider => (
                                    <button key={provider.id} type="button" onClick={() => openSecretImport(provider)} className="btn-secondary min-w-0 justify-start text-xs">
                                        <ProviderIcon provider={provider} />
                                        <span className="truncate">{provider.name || provider.id}</span>
                                    </button>
                                ))}
                            </div>
                            {secretLogin?.status === 'waiting' && (
                                <form onSubmit={submitSecretImport} className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                                    <p className="text-[10px] text-amber-100/80">
                                        {secretLogin.provider.id === 'cursor'
                                            ? t('dashboard.chatPage.cursorImportHelp', 'Export/copy accessToken and storage.serviceMachineId from your own Cursor installation. xBot does not read your local SQLite database.')
                                            : secretLogin.provider.id === 'grok-web'
                                                ? t('dashboard.chatPage.grokCookieWarning', 'Sensitive Grok subscription session. Logout or revocation invalidates it. The official xAI API is the safer alternative.')
                                                : secretLogin.provider.id === 'perplexity-web'
                                                    ? t('dashboard.chatPage.perplexityCookieWarning', 'Sensitive Perplexity Pro/Max session. Logout or revocation invalidates it. The official Perplexity API is the safer alternative.')
                                                    : t('dashboard.chatPage.callbackTokenHelp', 'Paste only the exact callback payload/token produced by the upstream provider flow.')}
                                    </p>
                                    <input type="password" autoComplete="off" value={secretInput} onChange={event => setSecretInput(event.target.value)} className="input-field w-full font-mono text-xs" placeholder={secretLogin.provider.id === 'cursor' ? 'accessToken' : t('dashboard.chatPage.secretValue', 'Secret value')} />
                                    {secretLogin.provider.id === 'cursor' && (
                                        <input type="password" autoComplete="off" value={cursorMachineId} onChange={event => setCursorMachineId(event.target.value)} className="input-field w-full font-mono text-xs" placeholder="storage.serviceMachineId" />
                                    )}
                                    <label className="flex items-start gap-2 text-[10px] text-surface-200/70">
                                        <input type="checkbox" checked={secretAcknowledged} onChange={event => setSecretAcknowledged(event.target.checked)} className="mt-0.5 accent-brand-500" />
                                        <span>{t('dashboard.chatPage.acknowledgeSensitiveImport', 'I understand this grants xBot access to this provider session and I can revoke it by logging out or disconnecting.')}</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <button type="submit" className="btn-primary flex-1 text-xs" disabled={!secretAcknowledged || !secretInput.trim() || (secretLogin.provider.id === 'cursor' && !cursorMachineId.trim())}>{t('dashboard.chatPage.validateAndConnect', 'Validate and connect')}</button>
                                        <button type="button" className="btn-secondary flex-1 text-xs" onClick={() => { setSecretInput(''); setCursorMachineId(''); setSecretLogin(null); }}>{t('dashboard.common.cancel', 'Cancel')}</button>
                                    </div>
                                </form>
                            )}
                            {secretLogin?.status === 'validating' && <p className="text-[10px] text-brand-300" role="status">{t('dashboard.chatPage.validatingCredential', 'Validating credential without storing it until validation succeeds…')}</p>}
                            {secretLogin?.status === 'connected' && <p className="text-[10px] text-emerald-300" role="status">{t('dashboard.chatPage.oauthConnected', 'Provider connected. Catalog and models were refreshed.')}</p>}
                            {['failed', 'expired'].includes(secretLogin?.status) && <p className="text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.secretImportFailed', 'Credential validation failed or the session expired. Nothing was connected.')}</p>}
                        </div>
                    )}
                    {visibleFreeProviders.length > 0 && (
                        <div className="space-y-2 border-t border-white/5 pt-2">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-surface-200/40">{t('dashboard.chatPage.freeServices', 'Free services')}</p>
                            {visibleFreeProviders.map(provider => (
                                <button key={provider.id} type="button" onClick={() => enableFree(provider)} className="btn-secondary min-w-0 justify-start text-xs" disabled={freeLogin?.status === 'starting'}>
                                    <ProviderIcon provider={provider} />
                                    <span className="truncate">{t('dashboard.chatPage.enableFreeProvider', 'Enable free provider')}: {provider.name || provider.id}</span>
                                </button>
                            ))}
                            {freeLogin?.status === 'connected' && <p className="text-[10px] text-emerald-300" role="status">{t('dashboard.chatPage.freeProviderEnabled', 'Free provider enabled for this account.')}</p>}
                            {freeLogin?.status === 'failed' && <p className="text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.freeProviderFailed', 'The free provider could not be validated.')}</p>}
                        </div>
                    )}
                    {visibleApiKeyProviders.length > 0 && (
                        <div className="space-y-2 border-t border-white/5 pt-2">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-surface-200/40">{t('dashboard.chatPage.apiKeyProviders', 'API-key providers')}</p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {visibleApiKeyProviders.map(provider => (
                                    <button
                                        key={provider.id}
                                        type="button"
                                        onClick={() => selectApiKeyProvider(provider)}
                                        className="btn-secondary min-w-0 justify-start text-xs"
                                        aria-label={`${t('dashboard.chatPage.selectProvider', 'Select provider')} ${provider.name || provider.id}`}
                                    >
                                        <ProviderIcon provider={provider} />
                                                                        <span className="truncate">{provider.name || provider.id}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {visibleProbeProviders.length > 0 && (
                        <div className="space-y-2 border-t border-white/5 pt-2">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-surface-200/40">
                                {t('dashboard.chatPage.serviceProbeProviders', 'Free service probe')}
                            </p>
                            <p className="text-[10px] text-surface-200/45">
                                {t('dashboard.chatPage.serviceProbeProvidersDesc', 'Probe the exact reviewed metadata endpoint. A retired service reports UPSTREAM_SERVICE_ENDED and never creates a fake connection.')}
                            </p>
                            {visibleProbeProviders.map(provider => (
                                <button key={provider.id} type="button" onClick={() => probeService(provider)} className="btn-secondary w-full justify-start text-xs" disabled={freeLogin?.provider === provider.id && freeLogin?.status === 'probing'}>
                                    <ProviderIcon provider={provider} />
                                    <span className="truncate">{provider.name || provider.id}</span>
                                    {freeLogin?.provider === provider.id && freeLogin?.status === 'probing' ? <Loader2 size={14} className="ml-auto animate-spin" /> : <Activity size={14} className="ml-auto" />}
                                </button>
                            ))}
                            {freeLogin?.status === 'ended' && <p className="text-[10px] text-amber-300" role="status">{t('dashboard.chatPage.upstreamServiceEnded', 'The exact upstream MiMo free service has ended. No connection was created.')}</p>}
                            {freeLogin?.status === 'failed' && <p className="text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.serviceProbeFailed', 'The bounded service probe failed; availability was not claimed.')}</p>}
                        </div>
                    )}
                    {visibleUnavailableProviders.length > 0 && (
                        <div className="space-y-1 border-t border-white/5 pt-2">
                            <button type="button" onClick={() => setShowMoreProviders(value => !value)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-[9px] font-semibold uppercase tracking-wide text-surface-200/50 hover:bg-white/5">
                                <span>{t('dashboard.chatPage.moreProviders', 'More providers')} ({visibleUnavailableProviders.length})</span>
                                <ChevronDown size={13} className={showMoreProviders ? 'rotate-180' : ''} />
                            </button>
                            {(showMoreProviders || providerSearch) && visibleUnavailableProviders.map(provider => (
                                <div key={provider.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-900/30 px-2.5 py-2">
                                    <span className="flex items-center gap-2 text-[10px] text-surface-200/65"><ProviderIcon provider={provider} />{provider.name || provider.id}</span>
                                    <span className="text-right text-[9px] text-amber-300/65">
                                        {unavailableReason(provider.connection?.reason)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {deviceLogin?.status === 'waiting' && (
                        <div className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-3 text-[10px] text-surface-200/70" role="status">
                            <p>{t('dashboard.chatPage.deviceLoginWaiting', 'Complete sign-in in the provider tab. xBot will detect the connection automatically.')}</p>
                            {deviceLogin.userCode && <p className="mt-2 font-mono text-sm font-semibold text-brand-300">{deviceLogin.userCode}</p>}
                            <a href={deviceLogin.verificationUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-brand-400 hover:underline">
                                {t('dashboard.chatPage.openProviderLogin', 'Open provider sign-in')}
                            </a>
                        </div>
                    )}
                    {deviceLogin?.status === 'connected' && <p className="text-[10px] text-emerald-300" role="status">{t('dashboard.chatPage.deviceLoginConnected', 'Provider connected. Models are being refreshed.')}</p>}
                    {['failed', 'expired'].includes(deviceLogin?.status) && <p className="text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.deviceLoginFailed', 'Provider sign-in did not complete. Please try again.')}</p>}
                </div>
            )}
            <form onSubmit={add} className="glass-card space-y-3 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-200/45">
                    {t('dashboard.chatPage.addProvider', 'Connect provider')}
                </p>
                <div className="relative">
                    <select
                        value={form.provider}
                        onChange={event => {
                            setForm({ ...form, provider: event.target.value });
                            setConnectionTest(null);
                        }}
                        className="input-field w-full appearance-none pr-8 text-xs"
                    >
                        <option value="openai-compatible">OpenAI Compatible</option>
                        {providersByCapability.apiKey.map(provider => <option key={provider.id} value={provider.id}>{provider.name || provider.id}</option>)}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-surface-200/40" />
                </div>
                {isCompatible && (
                    <>
                        <input
                            value={form.baseUrl}
                            onChange={event => { setForm({ ...form, baseUrl: event.target.value }); setConnectionTest(null); }}
                            className="input-field w-full text-xs"
                            placeholder={t('dashboard.chatPage.compatibleBaseUrl', 'OpenAI-compatible base URL (ending in /v1)')}
                            inputMode="url"
                            autoComplete="url"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                value={form.prefix}
                                onChange={event => setForm({ ...form, prefix: event.target.value })}
                                className="input-field w-full text-xs"
                                placeholder={t('dashboard.chatPage.compatiblePrefix', 'Model prefix')}
                            />
                            <select
                                value={form.apiType}
                                onChange={event => setForm({ ...form, apiType: event.target.value })}
                                className="input-field w-full text-xs"
                            >
                                <option value="chat">Chat Completions</option>
                                <option value="responses">Responses API</option>
                            </select>
                        </div>
                    </>
                )}
                <input
                    value={form.name}
                    onChange={event => setForm({ ...form, name: event.target.value })}
                    className="input-field w-full text-xs"
                    placeholder={t('dashboard.chatPage.connectionName', 'Connection name (optional)')}
                />
                <input
                    type="password"
                    autoComplete="off"
                    value={form.apiKey}
                    onChange={event => { setForm({ ...form, apiKey: event.target.value }); setConnectionTest(null); }}
                    className="input-field w-full text-xs"
                    placeholder={t('dashboard.chatPage.providerCredential', 'API key or provider token')}
                />
                {isCompatible && (
                    <button
                        type="button"
                        onClick={validateCompatible}
                        disabled={saving || connectionTest?.status === 'testing' || !form.baseUrl.trim() || !form.apiKey.trim()}
                        className="btn-secondary w-full text-xs"
                    >
                        {connectionTest?.status === 'testing' ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                        {t('dashboard.chatPage.testConnection', 'Test connection')}
                    </button>
                )}
                {connectionTest?.status === 'success' && <p className="text-[10px] text-emerald-300" role="status">{t('dashboard.chatPage.connectionTestSuccess', 'Connection succeeded. Models can be discovered.')}</p>}
                {connectionTest?.status === 'failed' && <p className="text-[10px] text-amber-300" role="alert">{t('dashboard.chatPage.connectionTestFailed', 'The endpoint rejected the connection or returned no model catalog.')}</p>}
                {connectionTest?.status === 'unreachable' && <p className="text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.connectionTestUnreachable', 'The endpoint is unreachable. Check the URL and try again.')}</p>}
                <button type="submit" disabled={saving || !form.apiKey.trim() || (isCompatible && (!form.baseUrl.trim() || !form.prefix.trim()))} className="btn-primary w-full text-xs">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {t('dashboard.chatPage.connect', 'Connect')}
                </button>
            </form>

            {!connections.length ? (
                <EmptyState
                    icon={Unplug}
                    title={t('dashboard.chatPage.noProviders', 'No provider connected')}
                    description={t('dashboard.chatPage.noProvidersDesc', 'Connect an account to make its models available in Chat AI.')}
                />
            ) : (
                <div className="space-y-2">
                    {connections.map(connection => {
                        const models = connectionModels[connection.id] || [];
                        const action = connectionActions[connection.id];
                        const health = connectionHealth(connection);
                        return (
                            <div key={connection.id} className="glass-card p-3">
                                <button type="button" onClick={() => toggleModels(connection)} className="flex w-full items-center gap-3 text-left" aria-expanded={expandedConnection === connection.id}>
                                    <ProviderIcon provider={{ id: connection.provider, name: connection.displayName || connection.provider }} size={32} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-surface-100">{connection.name || connection.displayName || connection.email || connection.provider}</p>
                                        {connection.email && <p className="truncate text-[9px] text-surface-200/45">{connection.email}</p>}
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            <span className="badge badge-info text-[8px]">{connection.provider}</span>
                                            <span className={healthBadgeClass(health)}>{t(`dashboard.chatPage.connectionHealth_${health}`, health)}</span>
                                            {connection.testStatus && <span className="badge text-[8px]">{connection.testStatus}</span>}
                                            {connectionModels[connection.id] && <span className="badge text-[8px]">{formatNumber(models.length)} {t('dashboard.chatPage.modelsAvailableShort', 'models available')}</span>}
                                        </div>
                                    </div>
                                    <ChevronDown size={15} className={`shrink-0 text-surface-200/40 transition-transform ${expandedConnection === connection.id ? 'rotate-180' : ''}`} />
                                </button>
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    <button type="button" onClick={() => testConnection(connection)} disabled={action === 'testing'} className="btn-secondary text-[10px]">{action === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}{action === 'valid' ? t('dashboard.chatPage.connectionTestSuccessShort', 'Healthy') : t('dashboard.chatPage.testConnection', 'Test')}</button>
                                    <button type="button" onClick={() => toggleModels(connection)} className="btn-secondary text-[10px]">{action === 'models-loading' ? <Loader2 size={14} className="animate-spin" /> : <Boxes size={14} />}{t('dashboard.chatPage.connectionDetails', 'Details')}</button>
                                    <button type="button" onClick={() => remove(connection.id)} className="btn-danger col-span-2 text-[10px] sm:col-span-1" aria-label={t('dashboard.chatPage.deleteProvider', 'Disconnect provider')}><Trash2 size={14} />{t('dashboard.chatPage.disconnect', 'Disconnect')}</button>
                                </div>
                                {action === 'invalid' && <p className="mt-2 text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.connectionTestFailed', 'Connection test failed.')}</p>}
                                {expandedConnection === connection.id && (
                                    <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {[
                                                [t('dashboard.chatPage.connectionEmail', 'Email'), connection.email || '—'],
                                                [t('dashboard.chatPage.connectionStatus', 'Status'), t(`dashboard.chatPage.connectionHealth_${health}`, health)],
                                                [t('dashboard.chatPage.connectionExpires', 'Expires'), connection.expiresAt ? new Date(connection.expiresAt).toLocaleString() : t('dashboard.chatPage.noExpiry', 'No expiry')],
                                                [t('dashboard.chatPage.connectionPlan', 'Plan'), connection.providerSpecificData?.chatgptPlanType || connection.providerSpecificData?.planType || connection.planType || '—']
                                            ].map(([label, value]) => <div key={label} className="rounded-lg bg-surface-900/35 p-2"><p className="text-[8px] uppercase tracking-wide text-surface-200/35">{label}</p><p className="mt-1 truncate text-[10px] font-medium text-surface-100" title={String(value)}>{value}</p></div>)}
                                        </div>
                                        <button type="button" onClick={() => testAllModels(connection)} disabled={action === 'models-testing' || !models.length} className="btn-primary w-full text-[10px]">
                                            {action === 'models-testing' ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}{t('dashboard.chatPage.testAllModels', 'Test all models')}
                                        </button>
                                        {action === 'models-test-error' && <p className="text-[10px] text-red-300" role="alert">{t('dashboard.chatPage.modelTestsFailed', 'Model tests could not be completed.')}</p>}
                                        <div className="max-h-64 space-y-2 overflow-auto">
                                            {action === 'models-error' ? <p className="text-[10px] text-red-300">{t('dashboard.chatPage.modelsUnavailable', 'Models are unavailable for this connection.')}</p>
                                                : models.length ? models.map(model => {
                                                    const result = modelTestResults[connection.id]?.[model.id];
                                                    const passed = result && (result.success === true || result.valid === true || result.ok === true);
                                                    return <div key={model.id || model.name} className="rounded-lg bg-surface-900/35 p-2">
                                                        <div className="flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-[10px] font-medium text-surface-100">{model.name || model.id}</p><span className={!result ? 'badge text-[8px]' : passed ? 'badge badge-success text-[8px]' : 'badge badge-danger text-[8px]'}>{!result ? t('dashboard.chatPage.notTested', 'Not tested') : passed ? t('dashboard.chatPage.modelTestPassed', 'Passed') : t('dashboard.chatPage.modelTestFailed', 'Failed')}</span></div>
                                                        <p className="truncate font-mono text-[9px] text-surface-200/40">{model.id}</p><ModelMetadata model={model} compact />
                                                    </div>;
                                                }) : action !== 'models-loading' && <p className="text-[10px] text-surface-200/40">{t('dashboard.chatPage.noConnectionModels', 'No models returned.')}</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Combos({ onChanged }) {
    const { t } = useTranslation();
    const [combos, setCombos] = useState([]);
    const [modelOptions, setModelOptions] = useState([]);
    const [name, setName] = useState('');
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState('');
    const [strategy, setStrategy] = useState('fallback');
    const [strategies, setStrategies] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [data, catalog, settings] = await Promise.all([
                api9r('/combos'),
                api.request('/ai/models', { cacheTtl: 0 }),
                api9r('/settings')
            ]);
            setCombos(data.combos || (Array.isArray(data) ? data : []));
            setModelOptions((catalog.models || []).filter(model => model?.id && model.upstream?.id !== 'combo'));
            setStrategies(settings.comboStrategies || {});
        } catch { setError('request_failed'); } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const create = async event => {
        event.preventDefault();
        if (!name.trim() || !selected.length) return;
        try {
            await api9r(editingId ? `/combos/${encodeURIComponent(editingId)}` : '/combos', {
                method: editingId ? 'PUT' : 'POST',
                body: JSON.stringify({ name: name.trim(), kind: 'llm', models: selected })
            });
            const previousName = editingId ? combos.find(combo => combo.id === editingId)?.name : '';
            const nextStrategies = { ...strategies };
            if (previousName && previousName !== name.trim()) delete nextStrategies[previousName];
            nextStrategies[name.trim()] = { ...(nextStrategies[name.trim()] || {}), fallbackStrategy: strategy };
            await api9r('/settings', { method: 'PATCH', body: JSON.stringify({ comboStrategies: nextStrategies }) });
            setName('');
            setSelected([]);
            setEditingId('');
            setStrategy('fallback');
            await load();
            onChanged?.();
        } catch { setError('request_failed'); }
    };

    const edit = combo => {
        setEditingId(combo.id);
        setName(combo.name || '');
        setSelected(combo.models || []);
        setStrategy(strategies[combo.name]?.fallbackStrategy || 'fallback');
    };

    const cancelEdit = () => {
        setEditingId('');
        setName('');
        setSelected([]);
        setStrategy('fallback');
    };

    const moveModel = (index, direction) => {
        setSelected(current => {
            const target = index + direction;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const comboCapabilities = combo => {
        const members = new Set(combo.models || []);
        const caps = modelOptions.filter(model => members.has(model.id)).map(modelCapabilityBadges);
        return { vision: caps.some(item => item.vision), reasoning: caps.some(item => item.reasoning) };
    };

    const remove = async id => {
        try {
            const comboName = combos.find(combo => combo.id === id)?.name;
            await api9r(`/combos/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (comboName && strategies[comboName]) {
                const nextStrategies = { ...strategies };
                delete nextStrategies[comboName];
                await api9r('/settings', { method: 'PATCH', body: JSON.stringify({ comboStrategies: nextStrategies }) });
            }
            await load();
            onChanged?.();
        } catch { setError('request_failed'); }
    };

    if (loading) return <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-brand-400" /></div>;

    return (
        <div className="space-y-4">
            {error && <ErrorState retry={load} />}
            <form onSubmit={create} className="glass-card space-y-3 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-200/45">
                    {editingId ? t('dashboard.chatPage.editCombo', 'Edit routing combo') : t('dashboard.chatPage.createCombo', 'Create routing combo')}
                </p>
                <input value={name} onChange={event => setName(event.target.value)} className="input-field w-full text-xs" placeholder={t('dashboard.chatPage.comboName', 'Combo name')} />
                <select value={strategy} onChange={event => setStrategy(event.target.value)} className="input-field w-full text-xs">
                    <option value="fallback">{t('dashboard.chatPage.comboFallback', 'Fallback (top priority first)')}</option>
                    <option value="round-robin">{t('dashboard.chatPage.comboRoundRobin', 'Sticky round robin')}</option>
                </select>
                <div className="max-h-40 space-y-1 overflow-auto">
                    {modelOptions.map(model => (
                        <label key={model.id} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/5">
                            <input
                                type="checkbox"
                                checked={selected.includes(model.id)}
                                onChange={() => setSelected(current => current.includes(model.id) ? current.filter(id => id !== model.id) : [...current, model.id])}
                                className="accent-brand-500"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] text-surface-200/75">{model.label || model.id}</span>
                                <span className="block truncate font-mono text-[9px] text-surface-200/35">{model.id}</span>
                                <ModelMetadata model={model} compact />
                            </span>
                        </label>
                    ))}
                </div>
                {selected.length > 1 && (
                    <div className="space-y-1 rounded-lg bg-surface-900/30 p-2">
                        <p className="text-[9px] text-surface-200/40">{t('dashboard.chatPage.comboPriority', 'Fallback priority (top first)')}</p>
                        {selected.map((modelId, index) => (
                            <div key={modelId} className="flex items-center gap-2 text-[10px] text-surface-200/70">
                                <span className="w-4 text-center">{index + 1}</span><span className="min-w-0 flex-1 truncate font-mono">{modelId}</span>
                                <button type="button" onClick={() => moveModel(index, -1)} disabled={index === 0} className="btn-secondary p-1"><ArrowUp size={12} /></button>
                                <button type="button" onClick={() => moveModel(index, 1)} disabled={index === selected.length - 1} className="btn-secondary p-1"><ArrowDown size={12} /></button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <button type="submit" disabled={!name.trim() || !selected.length} className="btn-primary flex-1 text-xs">{editingId ? <Save size={16} /> : <Plus size={16} />}{editingId ? t('dashboard.common.save', 'Save') : t('dashboard.chatPage.create', 'Create')}</button>
                    {editingId && <button type="button" onClick={cancelEdit} className="btn-secondary flex-1 text-xs"><X size={16} />{t('dashboard.common.cancel', 'Cancel')}</button>}
                </div>
            </form>
            {!combos.length ? (
                <EmptyState icon={Boxes} title={t('dashboard.chatPage.noCombos', 'No combos')} description={t('dashboard.chatPage.noCombosDesc', 'Combine provider accounts into fallback or load-balanced routes.')} />
            ) : combos.map(combo => {
                const capabilities = comboCapabilities(combo);
                const comboStrategy = strategies[combo.name]?.fallbackStrategy || 'fallback';
                return (
                    <div key={combo.id} className="glass-card flex items-center gap-3 p-3">
                        <Boxes size={20} className="text-brand-400" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-surface-100">{combo.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="badge badge-info text-[8px]">{t(`dashboard.chatPage.comboStrategy_${comboStrategy}`, comboStrategy)}</span>
                                <span className="badge text-[8px]">{(combo.models || []).length} {t('dashboard.chatPage.modelsAvailableShort', 'models')}</span>
                                {capabilities.vision && <span className="badge badge-success text-[8px]">👁 {t('dashboard.chatPage.capabilityVision', 'Vision')}</span>}
                                {capabilities.reasoning && <span className="badge badge-success text-[8px]">🧠 {t('dashboard.chatPage.capabilityReasoning', 'Reasoning')}</span>}
                            </div>
                        </div>
                        <button type="button" onClick={() => edit(combo)} className="btn-secondary p-2" aria-label={t('dashboard.chatPage.editCombo', 'Edit combo')}><Pencil size={16} /></button>
                        <button type="button" onClick={() => remove(combo.id)} className="btn-danger p-2" aria-label={t('dashboard.chatPage.deleteCombo', 'Delete combo')}><Trash2 size={16} /></button>
                    </div>
                );
            })}
        </div>
    );
}

function EndpointInfo() {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const endpointUrl = typeof window === 'undefined' ? '/api/ai/chat/stream' : `${window.location.origin}/api/ai/chat/stream`;
    const curlExample = `curl -N '${endpointUrl}' \\
  -H 'Authorization: Bearer <your-xBot-session-token>' \\
  -H 'Content-Type: application/json' \\
  --data '{"message":"Hello","provider":"9router","model":"<model-id>"}'`;
    const copyEndpoint = async () => {
        await navigator.clipboard.writeText(endpointUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div className="space-y-4">
            <div className="glass-card space-y-3 p-4">
                <div className="flex items-center gap-2"><Link2 size={18} className="text-brand-400" /><div><p className="text-xs font-semibold text-surface-100">{t('dashboard.chatPage.endpointTitle', 'Tenant-scoped Chat API')}</p><p className="text-[9px] text-surface-200/45">{t('dashboard.chatPage.endpointDesc', 'Uses your authenticated xBot account and tenant-isolated 9Router connections.')}</p></div></div>
                <div className="flex items-center gap-2 rounded-lg bg-surface-900/40 p-2"><code className="min-w-0 flex-1 break-all text-[10px] text-brand-200">{endpointUrl}</code><button type="button" onClick={copyEndpoint} className="btn-secondary shrink-0 p-2" aria-label={t('dashboard.chatPage.copyEndpoint', 'Copy endpoint URL')}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
            </div>
            <div className="glass-card space-y-3 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-surface-100"><ExternalLink size={16} className="text-brand-400" />{t('dashboard.chatPage.curlExample', 'curl example')}</div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/25 p-3 font-mono text-[9px] leading-relaxed text-surface-200/70">{curlExample}</pre>
                <p className="text-[9px] leading-relaxed text-amber-200/65">{t('dashboard.chatPage.endpointAuthNotice', 'Use only your own authenticated xBot session. Never share session tokens or provider credentials.')}</p>
            </div>
        </div>
    );
}

function Usage() {
    const { t } = useTranslation();
    const [period, setPeriod] = useState('7d');
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [chart, stats] = await Promise.all([
                api9r(`/usage/chart?period=${period}`),
                api9r(`/usage/stats?period=${period}`)
            ]);
            setData({ chart: Array.isArray(chart) ? chart : chart?.data || [], stats: stats || {} });
        } catch { setError('request_failed'); } finally { setLoading(false); }
    }, [period]);

    useEffect(() => { load(); }, [load]);

    const points = data?.chart || [];
    const totals = data?.stats || {};
    const providerRows = Object.entries(totals.byProvider || {}).sort(([, left], [, right]) => Number(right.requests || 0) - Number(left.requests || 0));
    const recentRequests = totals.recentRequests || [];
    const maxValue = Math.max(1, ...points.map(point => Number(point.tokens || 0)));

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                {['24h', '7d', '30d'].map(value => (
                    <button key={value} type="button" onClick={() => setPeriod(value)} className={period === value ? 'btn-primary text-[10px]' : 'btn-secondary text-[10px]'}>{value}</button>
                ))}
                <button type="button" onClick={load} className="btn-secondary ml-auto p-2" aria-label={t('dashboard.common.refresh', 'Refresh')}><RefreshCw size={14} /></button>
            </div>
            {loading ? <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-brand-400" /></div>
                : error ? <ErrorState retry={load} />
                    : (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    ['Requests', totals.totalRequests || 0],
                                    ['Tokens', Number(totals.totalPromptTokens || 0) + Number(totals.totalCompletionTokens || 0)],
                                    ['Input', totals.totalPromptTokens || 0],
                                    ['Cost', formatCost(totals.totalCost || 0)]
                                ].map(([label, value]) => (
                                    <div key={label} className="stat-card p-3">
                                        <p className="text-[9px] uppercase tracking-wide text-surface-200/40">{label}</p>
                                        <p className="mt-1 text-lg font-bold text-surface-100">{typeof value === 'string' ? value : formatNumber(value)}</p>
                                    </div>
                                ))}
                            </div>
                            {!points.length ? <EmptyState icon={Activity} title={t('dashboard.chatPage.noUsage', 'No usage yet')} description={t('dashboard.chatPage.noUsageDesc', 'Requests made from dashboard and Telegram will appear here.')} />
                                : (
                                    <div className="glass-card p-3">
                                        <div className="flex h-32 items-end gap-1">
                                            {points.slice(-30).map((point, index) => (
                                                <div key={`${point.label || index}-${index}`} title={`${point.label || ''}: ${formatNumber(point.tokens)} tokens, ${formatCost(point.cost)}`} className="min-w-0 flex-1 rounded-t bg-brand-500/70" style={{ height: `${Math.max(4, (Number(point.tokens || 0) / maxValue) * 100)}%` }} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            {providerRows.length > 0 && (
                                <div className="glass-card p-3">
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-surface-200/45">{t('dashboard.chatPage.usageByProvider', 'Provider breakdown')}</p>
                                    <div className="space-y-2">
                                        {providerRows.map(([provider, value]) => (
                                            <div key={provider} className="grid grid-cols-[1fr_auto_auto] gap-3 text-[10px] text-surface-200/65">
                                                <span className="truncate font-medium text-surface-100">{provider}</span>
                                                <span>{formatNumber(value.requests)} req</span>
                                                <span>{formatNumber(Number(value.promptTokens || 0) + Number(value.completionTokens || 0))} tok · {formatCost(value.cost)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {recentRequests.length > 0 && (
                                <div className="glass-card p-3">
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-surface-200/45">{t('dashboard.chatPage.recentRequests', 'Recent requests')}</p>
                                    <div className="max-h-48 space-y-2 overflow-auto">
                                        {recentRequests.slice(0, 12).map((request, index) => (
                                            <div key={`${request.timestamp || index}-${index}`} className="flex items-center gap-2 text-[9px] text-surface-200/50">
                                                <span className={request.status === 'ok' ? 'badge badge-success text-[8px]' : 'badge badge-danger text-[8px]'}>{request.status || '—'}</span>
                                                <span className="min-w-0 flex-1 truncate">{request.provider} / {request.model}</span>
                                                <span>{formatNumber(Number(request.promptTokens || 0) + Number(request.completionTokens || 0))} tok</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
        </div>
    );
}

function Quota({ connections }) {
    const { t } = useTranslation();
    const [quota, setQuota] = useState({});
    const [loading, setLoading] = useState({});
    const [errors, setErrors] = useState({});

    const refresh = useCallback(async connection => {
        setLoading(current => ({ ...current, [connection.id]: true }));
        setErrors(current => ({ ...current, [connection.id]: '' }));
        try {
            const value = await api9r(`/usage/${encodeURIComponent(connection.id)}`);
            setQuota(current => ({ ...current, [connection.id]: value }));
        } catch {
            setErrors(current => ({ ...current, [connection.id]: 'request_failed' }));
        } finally {
            setLoading(current => ({ ...current, [connection.id]: false }));
        }
    }, []);

    useEffect(() => {
        connections.forEach(connection => refresh(connection));
    }, [connections, refresh]);

    if (!connections.length) return <EmptyState icon={Gauge} title={t('dashboard.chatPage.noQuota', 'No quota to track')} description={t('dashboard.chatPage.noQuotaDesc', 'Connect a supported provider account first.')} />;

    return (
        <div className="space-y-2">
            {connections.map(connection => {
                const value = quota[connection.id] || {};
                const sourceRows = value.quotas || value.limits || [];
                const rows = Array.isArray(sourceRows)
                    ? sourceRows
                    : Object.entries(sourceRows).map(([name, details]) => ({ name, ...(details || {}) }));
                const health = errors[connection.id] ? 'error' : connection.isActive === false ? 'inactive' : rows.length ? 'healthy' : 'unknown';
                return (
                    <div key={connection.id} className="glass-card p-3">
                        <div className="flex items-center gap-2">
                            <Gauge size={16} className="text-brand-400" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-surface-100">{connection.name || connection.email || connection.provider}</p>
                                <p className="text-[9px] text-surface-200/40">{connection.provider}</p>
                            </div>
                            <span className={health === 'healthy' ? 'badge badge-success text-[8px]' : health === 'error' || health === 'inactive' ? 'badge badge-danger text-[8px]' : 'badge text-[8px]'}>{health}</span>
                            <button type="button" onClick={() => refresh(connection)} disabled={loading[connection.id]} className="btn-secondary p-2" aria-label={t('dashboard.chatPage.refreshQuota', 'Refresh quota')}>
                                <RefreshCw size={14} className={loading[connection.id] ? 'animate-spin' : ''} />
                            </button>
                        </div>
                        {errors[connection.id] && <p className="mt-2 text-[10px] text-red-300">{errors[connection.id]}</p>}
                        {!loading[connection.id] && !errors[connection.id] && (
                            <div className="mt-3 space-y-2">
                                {rows.length ? rows.map((row, index) => {
                                    const remaining = Number(row.remainingPercentage ?? row.remaining_percentage ?? row.percentage ?? row.percentRemaining ?? (row.total > 0 ? (Number(row.remaining || 0) / Number(row.total)) * 100 : 0));
                                    const resetAt = row.resetAt || row.reset_at || row.reset;
                                    return (
                                        <div key={row.id || row.name || index}>
                                            <div className="mb-1 flex justify-between text-[9px] text-surface-200/55">
                                                <span>{row.name || row.label || 'Quota'}</span><span>{Number.isFinite(remaining) ? `${Math.round(remaining)}%` : '—'}</span>
                                            </div>
                                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-700">
                                                <div className={`h-full rounded-full ${remaining < 20 ? 'bg-red-500' : remaining < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(0, Math.min(100, remaining))}%` }} />
                                            </div>
                                            <div className="mt-1 flex justify-between text-[8px] text-surface-200/35">
                                                <span>{row.unlimited ? t('dashboard.chatPage.unlimitedQuota', 'Unlimited') : row.total > 0 ? `${formatNumber(row.remaining)} / ${formatNumber(row.total)} remaining` : ''}</span>
                                                {resetAt && <span>{t('dashboard.chatPage.quotaResets', 'Resets')} {new Date(resetAt).toLocaleString()}</span>}
                                            </div>
                                        </div>
                                    );
                                }) : <p className="text-[10px] text-surface-200/40">{value.message || t('dashboard.chatPage.quotaUnavailable', 'This provider does not expose quota details.')}</p>}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function NineRouterSettings({ onModelsChanged, initialSection = 'providers' }) {
    const { t } = useTranslation();
    const [section, setSection] = useState(initialSection);
    const [connections, setConnections] = useState([]);

    const loadConnections = useCallback(async () => {
        try {
            const data = await api9r('/providers');
            setConnections(data.connections || data.providers || (Array.isArray(data) ? data : []));
        } catch { setConnections([]); }
    }, []);

    useEffect(() => { loadConnections(); }, [loadConnections]);

    const changed = useCallback(() => {
        loadConnections();
        onModelsChanged?.();
    }, [loadConnections, onModelsChanged]);

    const content = useMemo(() => {
        if (section === 'providers') return <Providers onChanged={changed} />;
        if (section === 'combos') return <Combos onChanged={changed} />;
        if (section === 'endpoint') return <EndpointInfo />;
        if (section === 'usage') return <Usage />;
        return <Quota connections={connections} />;
    }, [changed, connections, section]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-800/60 p-1 sm:grid-cols-5">
                {SECTIONS.map(item => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setSection(item.id)}
                            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-medium transition-colors ${
                                section === item.id ? 'bg-brand-500/15 text-brand-400' : 'text-surface-200/50 hover:bg-white/5'
                            }`}
                            aria-pressed={section === item.id}
                        >
                            <Icon size={14} />
                            {t(`dashboard.chatPage.nineRouter_${item.key}`, item.key)}
                        </button>
                    );
                })}
            </div>
            {content}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/10 p-3 text-[9px] text-emerald-200/70">
                <Check size={14} />
                {t('dashboard.chatPage.nineRouterTenantBound', 'Bound to your authenticated Telegram account')}
            </div>
        </div>
    );
}
