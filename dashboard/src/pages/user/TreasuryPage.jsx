import { useState, useEffect, useCallback } from 'react';
import useAuthStore from '@/stores/authStore';

const API = '/api/dashboard';
const MOODS = {
    HAPPY: { emoji: '😺', label: 'Happy', color: '#4CAF50', bg: 'rgba(76,175,80,0.15)' },
    PROUD: { emoji: '😸', label: 'Proud', color: '#FF9800', bg: 'rgba(255,152,0,0.15)' },
    EXCITED: { emoji: '🙀', label: 'Excited', color: '#E91E63', bg: 'rgba(233,30,99,0.15)' },
    SAD: { emoji: '😿', label: 'Sad', color: '#607D8B', bg: 'rgba(96,125,139,0.15)' },
    SLEEPY: { emoji: '😴', label: 'Sleepy', color: '#9E9E9E', bg: 'rgba(158,158,158,0.15)' },
    ANGRY: { emoji: '😾', label: 'Angry', color: '#F44336', bg: 'rgba(244,67,54,0.15)' },
    LOVE: { emoji: '😻', label: 'In Love', color: '#E91E63', bg: 'rgba(233,30,99,0.15)' },
    NEUTRAL: { emoji: '🐱', label: 'Calm', color: '#2196F3', bg: 'rgba(33,150,243,0.15)' }
};

function StatBar({ label, value, max = 100, color = 'var(--brand-500)' }) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: 'var(--text-secondary)' }}>
                <span>{label}</span><span style={{ color }}>{value}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-700)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: color, transition: 'width 0.6s ease' }} />
            </div>
        </div>
    );
}

export default function TreasuryPage() {
    const { token, isOwner } = useAuthStore();
    const [status, setStatus] = useState(null);
    const [tamaStatus, setTamaStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState('');

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const fetchAll = useCallback(async () => {
        try {
            const [tRes, pRes] = await Promise.all([
                fetch(`${API}/treasury/status`, { headers }),
                fetch(`${API}/tamagotchi/status`, { headers })
            ]);
            if (tRes.ok) setStatus(await tRes.json());
            if (pRes.ok) setTamaStatus(await pRes.json());
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [token]);

    useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

    const doAction = async (endpoint, body = {}) => {
        setActionLoading(endpoint);
        try {
            await fetch(`${API}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
            await fetchAll();
        } catch (e) { console.error(e); }
        setActionLoading('');
    };

    if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;

    const mood = MOODS[tamaStatus?.mood] || MOODS.NEUTRAL;
    const tState = tamaStatus?.state || {};

    return (
        <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🏦 AI Treasury & Pet</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>Autonomous AI-managed community fund & Banmao Tamagotchi on X Layer</p>

            {/* Grid: Treasury + Tamagotchi */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 24 }}>

                {/* ═══ TREASURY GOVERNOR ═══ */}
                <div style={{ background: 'var(--surface-800)', borderRadius: 16, padding: 20, border: '1px solid var(--surface-700)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600 }}>🏛 Treasury Governor</h2>
                        <span style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            background: status?.isRunning ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                            color: status?.isRunning ? '#4CAF50' : '#F44336'
                        }}>
                            {status?.isRunning ? '● Running' : '○ Stopped'}
                        </span>
                    </div>

                    {/* Config */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
                        <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Mode</div>
                            <div style={{ fontWeight: 600 }}>{status?.config?.mode === 'paper' ? '📝 Paper' : '🔴 LIVE'}</div>
                        </div>
                        <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Risk</div>
                            <div style={{ fontWeight: 600 }}>{status?.config?.riskLevel || 'moderate'}</div>
                        </div>
                        <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Max Action</div>
                            <div style={{ fontWeight: 600 }}>{status?.config?.maxActionPct || 5}%</div>
                        </div>
                        <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>Today</div>
                            <div style={{ fontWeight: 600 }}>{status?.dailyActions || 0} actions</div>
                        </div>
                    </div>

                    {/* Stats */}
                    {status?.stats && (
                        <div style={{ borderTop: '1px solid var(--surface-700)', paddingTop: 12, marginBottom: 12, fontSize: 13 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Total Actions</span>
                                <span>{status.stats.totalActions || 0}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Buy Volume</span>
                                <span style={{ color: '#4CAF50' }}>${Number(status.stats.totalBuyUsd || 0).toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Sell Volume</span>
                                <span style={{ color: '#F44336' }}>${Number(status.stats.totalSellUsd || 0).toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Total PnL</span>
                                <span style={{ fontWeight: 600, color: (status.stats.totalPnl || 0) >= 0 ? '#4CAF50' : '#F44336' }}>
                                    ${Number(status.stats.totalPnl || 0).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Last Cycle */}
                    {status?.lastCycle && (
                        <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Last Decision: {status.lastCycle.decision?.action}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                                Confidence: {status.lastCycle.decision?.confidence}% — {status.lastCycle.decision?.reason}
                            </div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4 }}>
                                {Math.round((Date.now() - status.lastCycle.timestamp) / 60000)}min ago
                            </div>
                        </div>
                    )}

                    {/* Owner Controls */}
                    {isOwner() && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {!status?.isRunning ? (
                                <button onClick={() => doAction('treasury/start', { mode: 'paper' })} disabled={!!actionLoading}
                                    style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #4CAF50, #2E7D32)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                    {actionLoading === 'treasury/start' ? '...' : '▶ Start (Paper)'}
                                </button>
                            ) : (
                                <button onClick={() => doAction('treasury/stop')} disabled={!!actionLoading}
                                    style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #F44336, #C62828)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                    {actionLoading === 'treasury/stop' ? '...' : '■ Stop'}
                                </button>
                            )}
                            <button onClick={() => doAction('treasury/run-cycle')} disabled={!!actionLoading}
                                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--surface-600)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer', fontSize: 13 }}>
                                {actionLoading === 'treasury/run-cycle' ? '...' : '🔄 Run Cycle'}
                            </button>
                        </div>
                    )}
                </div>

                {/* ═══ BANMAO TAMAGOTCHI ═══ */}
                <div style={{ background: 'var(--surface-800)', borderRadius: 16, padding: 20, border: '1px solid var(--surface-700)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600 }}>🐱 Banmao Pet</h2>
                        <span style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            background: tamaStatus?.isRunning ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                            color: tamaStatus?.isRunning ? '#4CAF50' : '#F44336'
                        }}>
                            {tamaStatus?.isRunning ? '● Active' : '○ Inactive'}
                        </span>
                    </div>

                    {/* Pet Avatar */}
                    <div style={{
                        textAlign: 'center', padding: 20, marginBottom: 16,
                        background: mood.bg, borderRadius: 16, border: `1px solid ${mood.color}33`
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 8, animation: 'bounce 2s infinite' }}>{mood.emoji}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: mood.color }}>{mood.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Level {tState.level || 1} — {tState.xp || 0} XP</div>
                    </div>

                    {/* Stats */}
                    <StatBar label="😊 Happiness" value={tState.happiness || 50} color="#FF9800" />
                    <StatBar label="⚡ Energy" value={tState.energy || 100} color="#4CAF50" />

                    {/* On-chain data */}
                    {tamaStatus?.lastData && (
                        <div style={{ background: 'var(--surface-700)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>📊 On-chain State</div>
                            {tamaStatus.lastData.price > 0 && <div>BANMAO: ${tamaStatus.lastData.price.toFixed(8)}</div>}
                            {tamaStatus.lastData.holders > 0 && <div>Holders: {tamaStatus.lastData.holders.toLocaleString()}</div>}
                            <div>Smart Money buys: {tamaStatus.lastData.smartMoneyBuys}</div>
                        </div>
                    )}

                    {/* Interaction buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => doAction('tamagotchi/interact', { action: 'feed' })} disabled={!!actionLoading}
                            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--surface-600)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                            🍖 Feed
                        </button>
                        <button onClick={() => doAction('tamagotchi/interact', { action: 'play' })} disabled={!!actionLoading}
                            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--surface-600)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                            🎾 Play
                        </button>
                        <button onClick={() => doAction('tamagotchi/interact', { action: 'pet' })} disabled={!!actionLoading}
                            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--surface-600)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                            🤗 Pet
                        </button>
                    </div>

                    {/* Owner start/stop */}
                    {isOwner() && (
                        <div style={{ marginTop: 12 }}>
                            {!tamaStatus?.isRunning ? (
                                <button onClick={() => doAction('tamagotchi/start')} disabled={!!actionLoading}
                                    style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #FF9800, #E65100)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                    ▶ Start Tamagotchi
                                </button>
                            ) : (
                                <button onClick={() => doAction('tamagotchi/stop')} disabled={!!actionLoading}
                                    style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #F44336', background: 'transparent', color: '#F44336', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                    ■ Stop Tamagotchi
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ RECENT TREASURY ACTIONS ═══ */}
            {status?.recentActions?.length > 0 && (
                <div style={{ background: 'var(--surface-800)', borderRadius: 16, padding: 20, border: '1px solid var(--surface-700)' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>📋 Recent Treasury Actions</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {status.recentActions.map((a, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface-700)', borderRadius: 10, fontSize: 13 }}>
                                <span style={{ fontSize: 20 }}>{a.action === 'BUY' ? '🟢' : a.action === 'SELL' ? '🔴' : '⏸️'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600 }}>{a.action} — ${Number(a.amountUsd || 0).toFixed(2)} {a.mode === 'paper' ? '📝' : ''}</div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{a.reason?.slice(0, 80)}</div>
                                </div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{a.createdAt}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
            `}</style>
        </div>
    );
}
