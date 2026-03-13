import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import config from '@/config';
import useThemeStore from '@/stores/themeStore';
import Layout from '@/components/layout/Layout';
import LoginModal from '@/components/LoginModal';
import ToastContainer from '@/components/ToastContainer';
import ChatWidget from '@/components/ChatWidget';
import ErrorBoundary, { OfflineBanner } from '@/components/ErrorBoundary';
import { PageSkeleton } from '@/components/Skeleton';
import { setupBackButton, isTelegramMiniApp } from '@/utils/telegram';

// Lazy-loaded pages for code splitting
const DashboardPage = lazy(() => import('@/pages/owner/DashboardPage'));
const UsersPage = lazy(() => import('@/pages/owner/UsersPage'));
const GroupsPage = lazy(() => import('@/pages/owner/GroupsPage'));
const AnalyticsPage = lazy(() => import('@/pages/owner/AnalyticsPage'));
const AlertsPage = lazy(() => import('@/pages/owner/AlertsPage'));
const PostsPage = lazy(() => import('@/pages/owner/PostsPage'));
const ConfigPage = lazy(() => import('@/pages/owner/ConfigPage'));
const ProfilePage = lazy(() => import('@/pages/user/ProfilePage'));
const SettingsPage = lazy(() => import('@/pages/user/SettingsPage'));
const WalletsPage = lazy(() => import('@/pages/user/WalletsPage'));
const TradingPage = lazy(() => import('@/pages/user/TradingPage'));
const LeaderboardPage = lazy(() => import('@/pages/user/LeaderboardPage'));
const ChatPage = lazy(() => import('@/pages/user/ChatPage'));
const OKXTradingPage = lazy(() => import('@/pages/user/OKXTradingPage'));
const TransferHistoryPage = lazy(() => import('@/pages/user/TransferHistoryPage'));
const CommunityPage = lazy(() => import('@/pages/user/CommunityPage'));
const AuditLogPage = lazy(() => import('@/pages/owner/AuditLogPage'));
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function SuspenseWrapper({ children }) {
    return (
        <Suspense fallback={<PageSkeleton />}>
            {children}
        </Suspense>
    );
}

export default function App() {
    const { init, loading, isAuthenticated, isOwner, isOwnerView } = useAuthStore();
    const { initTheme } = useThemeStore();
    const [showLogin, setShowLogin] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        init();
        initTheme();
    }, []);

    // #5 — Telegram Mini App Back Button
    const handleBack = useCallback(() => navigate(-1), [navigate]);
    useEffect(() => {
        if (!isTelegramMiniApp()) return;
        const isHome = location.pathname === '/' || location.pathname === '';
        setupBackButton(!isHome, handleBack);
        return () => setupBackButton(false, handleBack);
    }, [location.pathname, handleBack]);

    if (loading) {
        return (
            <div className="min-h-screen bg-surface-900 flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-surface-200/50">Loading {config.appName} {config.appTagline}...</p>
                </div>
            </div>
        );
    }

    // Not authenticated → show landing page with login modal
    if (!isAuthenticated()) {
        return (
            <>
                <Suspense fallback={null}>
                    <LandingPage onLogin={() => setShowLogin(true)} />
                </Suspense>
                <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
                <ToastContainer />
            </>
        );
    }

    // Authenticated → full dashboard
    return (
        <>
            <OfflineBanner />
            <ErrorBoundary>
            <Routes>
                <Route path="/" element={<Layout />}>
                    {/* Owner Routes */}
                    {isOwnerView() ? (
                        <Route index element={<SuspenseWrapper><DashboardPage /></SuspenseWrapper>} />
                    ) : (
                        <Route index element={<SuspenseWrapper><ProfilePage /></SuspenseWrapper>} />
                    )}
                    <Route path="users" element={isOwnerView() ? <SuspenseWrapper><UsersPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="groups" element={isOwnerView() ? <SuspenseWrapper><GroupsPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="analytics" element={isOwnerView() ? <SuspenseWrapper><AnalyticsPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="alerts" element={isOwnerView() ? <SuspenseWrapper><AlertsPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="posts" element={isOwnerView() ? <SuspenseWrapper><PostsPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="config" element={isOwnerView() ? <SuspenseWrapper><ConfigPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    {/* User Routes */}
                    <Route path="chat" element={<SuspenseWrapper><ChatPage /></SuspenseWrapper>} />
                    <Route path="profile" element={<SuspenseWrapper><ProfilePage /></SuspenseWrapper>} />
                    <Route path="settings" element={<SuspenseWrapper><SettingsPage /></SuspenseWrapper>} />
                    <Route path="wallets" element={<SuspenseWrapper><WalletsPage /></SuspenseWrapper>} />
                    <Route path="trading" element={<SuspenseWrapper><TradingPage /></SuspenseWrapper>} />
                    <Route path="leaderboard" element={<SuspenseWrapper><LeaderboardPage /></SuspenseWrapper>} />
                    <Route path="okx-trading" element={<SuspenseWrapper><OKXTradingPage /></SuspenseWrapper>} />
                    <Route path="history" element={<SuspenseWrapper><TransferHistoryPage /></SuspenseWrapper>} />
                    <Route path="community" element={<SuspenseWrapper><CommunityPage /></SuspenseWrapper>} />
                    <Route path="audit-log" element={isOwnerView() ? <SuspenseWrapper><AuditLogPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    {/* 404 */}
                    <Route path="*" element={<SuspenseWrapper><NotFoundPage /></SuspenseWrapper>} />
                </Route>
            </Routes>
            </ErrorBoundary>
            <ToastContainer />
            <ChatWidget />
        </>
    );
}
