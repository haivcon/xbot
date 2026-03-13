import { useState, useEffect } from 'react';
import { Trophy, X, Star, Flame, Award, Zap } from 'lucide-react';

const ACHIEVEMENT_ICONS = {
    'first_trade': '🎯',
    'ten_trades': '🔥',
    'hundred_trades': '💎',
    'first_win': '🏆',
    'streak_5': '⚡',
    'top_10': '🌟',
    'wallet_created': '💳',
    'level_up': '📈',
    'default': '🎉',
};

/**
 * AchievementToast — animated pop-up when a new achievement is unlocked.
 * Usage: <AchievementToast achievement={{ id, title, description, icon }} onDismiss={() => {}} />
 */
export default function AchievementToast({ achievement, onDismiss }) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        if (!achievement) return;
        setVisible(true);
        setExiting(false);
        const timer = setTimeout(() => {
            setExiting(true);
            setTimeout(() => {
                setVisible(false);
                onDismiss?.();
            }, 500);
        }, 5000);
        return () => clearTimeout(timer);
    }, [achievement]);

    if (!visible || !achievement) return null;

    const icon = ACHIEVEMENT_ICONS[achievement.icon] || ACHIEVEMENT_ICONS.default;

    return (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] ${exiting ? 'animate-slideOut' : 'animate-slideIn'}`}>
            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 border border-amber-500/30 shadow-2xl shadow-amber-500/10 backdrop-blur-xl min-w-[300px] max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-3xl flex-shrink-0 animate-bounce">
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-amber-400/80 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                        <Trophy size={10} />
                        Achievement Unlocked!
                    </p>
                    <p className="text-sm font-bold text-surface-100 mt-0.5">{achievement.title}</p>
                    {achievement.description && (
                        <p className="text-[11px] text-surface-200/50 mt-0.5">{achievement.description}</p>
                    )}
                </div>
                <button onClick={() => { setExiting(true); setTimeout(() => { setVisible(false); onDismiss?.(); }, 300); }}
                    className="p-1 rounded-lg text-surface-200/30 hover:text-surface-200/60 transition-colors flex-shrink-0">
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}

// CSS animations (add to index.css or use inline)
// @keyframes slideIn { from { transform: translateX(-50%) translateY(-100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
// @keyframes slideOut { from { transform: translateX(-50%) translateY(0); opacity: 1; } to { transform: translateX(-50%) translateY(-100%); opacity: 0; } }
