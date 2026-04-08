import { useState, useEffect, useCallback } from 'react';
import useAuthStore from '@/stores/authStore';

const API = '/api/dashboard';

export default function SmartCopyPage() {
    const { token } = useAuthStore();
    const [status, setStatus] = useState(null);
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState('');
    const [budget, setBudget] = useState(50);

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const fetchData = useCallback(async () => {
        try {
            const [sRes, lRes] = await Promise.all([
                fetch(`${API}/smart-copy/status`, { headers }),
                fetch(`${API}/smart-copy/leaders`, { headers })
            ]);
            if (sRes.ok) setStatus(await sRes.json());
            if (lRes.ok) { const d = await lRes.json(); setLeaders(d.leaders || []); }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [token]);

    useEffect(() => { fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i); }, [fetchData]);

    const doAction = async (endpoint, body = {}) => {
        setActionLoading(endpoint);
        try {
            await fetch(`${API}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
            await fetchData();
        } catch (e) { console.error(e); }
        setActionLoading('');
    };

    if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;

    return (
        <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🐋 Smart Copy-Trader</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
                Zero-click AI copy-trading — automatically follows top whale & Smart Money traders on X Layer
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 24 }}>

                {/* ═══ SESSION STATUS ═══ */}
                <div style={{ background: 'var(--surface-800)', borderRadius: 16, padding: 20, border: '1px solid var(--surface-700)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600 }}>📊 Copy Session</h2>
                        <span style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            background: status?.isActive ? 'rgba(76,175,80,0.15)' : 'rgba(158,158,158,0.15)',
                            color: status?.isActive ? '#4CAF50' : '#9E9E9E'
                        }}>
                            {status?.isActive ? '● Active' : '○ Inactive'}
                        </span>
                    </div>

                    {status?.isActive && status?.session && (
                        <>
                            {/* Budget bar */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Budget Used</span>
                                    <span>${Number(status.spent || 0).toFixed(2)} / ${Number(status.budget || 0).toFixed(2)}</span>
                                </div>
                                <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-700)', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${Math.min(100, (status.spent / Math.max(1, status.budget)) * 100)}%`,
                                        height: '100%', borderRadius: 4,
                                        background: 'linear-gradient(90deg, #4CAF50, #FF9800)',
                                        transition: 'width 0.6s ease'
                                    }} />
                                </div>
                            </div>

                            {/* Stats grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
                                <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                                    <div style={{ color: 'var(--text-secondary)' }}>Total Copies</div>
                                    <div style={{ fontWeight: 700, fontSize: 20 }}>{status.totalCopies || 0}</div>
                                </div>
                                <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                                    <div style={{ color: 'var(--text-secondary)' }}>PnL</div>
                                    <div style={{ fontWeight: 700, fontSize: 20, color: (status.totalPnl || 0) >= 0 ? '#4CAF50' : '#F44336' }}>
                                        ${Number(status.totalPnl || 0).toFixed(2)}
                                    </div>
                                </div>
                                <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                                    <div style={{ color: 'var(--text-secondary)' }}>Remaining</div>
                                    <div style={{ fontWeight: 600 }}>${Number(status.remaining || 0).toFixed(2)}</div>
                                </div>
                                <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                                    <div style={{ color: 'var(--text-secondary)' }}>Polling</div>
                                    <div style={{ fontWeight: 600, color: status.isPolling ? '#4CAF50' : '#9E9E9E' }}>
                                        {status.isPolling ? 'Active' : 'Paused'}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Controls */}
                    {!status?.isActive ? (
                        <div>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                                Budget (USDT):
                                <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} min={5} max={10000}
                                    style={{ display: 'block', width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--surface-600)', background: 'var(--surface-700)', color: 'var(--text-primary)', fontSize: 14, marginTop: 4 }} />
                            </label>
                            <button onClick={() => doAction('smart-copy/start', { budgetUsd: budget })} disabled={!!actionLoading}
                                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2196F3, #1565C0)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, marginTop: 8 }}>
                                {actionLoading === 'smart-copy/start' ? 'Starting...' : '🚀 Start Auto Copy'}
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => doAction('smart-copy/stop')} disabled={!!actionLoading}
                            style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid #F44336', background: 'transparent', color: '#F44336', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                            {actionLoading === 'smart-copy/stop' ? 'Stopping...' : '■ Stop Copy Session'}
                        </button>
                    )}
                </div>

                {/* ═══ TOP LEADERS ═══ */}
                <div style={{ background: 'var(--surface-800)', borderRadius: 16, padding: 20, border: '1px solid var(--surface-700)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600 }}>🏆 Top Traders</h2>
                        <button onClick={() => doAction('smart-copy/discover')} disabled={!!actionLoading}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--surface-600)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
                            {actionLoading === 'smart-copy/discover' ? '...' : '🔍 Discover'}
                        </button>
                    </div>

                    {leaders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontSize: 14 }}>
                            No leaders discovered yet. Click "Discover" to find top traders on X Layer.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {leaders.slice(0, 8).map((l, i) => {
                                const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`;
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface-700)', borderRadius: 10, fontSize: 13 }}>
                                        <span style={{ fontSize: 16, width: 28, textAlign: 'center' }}>{medal}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.address?.slice(0, 12)}...{l.address?.slice(-4)}</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                                {l.tag} · Win: {Number(l.winRate || 0).toFixed(1)}% · PnL: ${Number(l.totalPnlUsd || 0).toFixed(0)}
                                            </div>
                                        </div>
                                        <div style={{
                                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                            background: l.aiScore > 70 ? 'rgba(76,175,80,0.15)' : l.aiScore > 40 ? 'rgba(255,152,0,0.15)' : 'rgba(158,158,158,0.15)',
                                            color: l.aiScore > 70 ? '#4CAF50' : l.aiScore > 40 ? '#FF9800' : '#9E9E9E'
                                        }}>
                                            {l.aiScore}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ RECENT COPY TRADES ═══ */}
            {status?.recentTrades?.length > 0 && (
                <div style={{ background: 'var(--surface-800)', borderRadius: 16, padding: 20, border: '1px solid var(--surface-700)' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>📋 Recent Copy Trades</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {status.recentTrades.map((t, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface-700)', borderRadius: 10, fontSize: 13 }}>
                                <span style={{ fontSize: 18 }}>{t.action === 'buy' ? '🟢' : '🔴'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600 }}>{t.tokenSymbol} — ${Number(t.copyAmountUsd || 0).toFixed(2)}</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>From: {t.leaderAddress?.slice(0, 10)}... ({t.leaderTag})</div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t.createdAt}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
