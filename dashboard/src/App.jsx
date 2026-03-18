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
const SettingsPage = lazy(() => import('@/pages/user/SettingsPage'));
const WalletsPage = lazy(() => import('@/pages/user/WalletsPage'));
const TradingPage = lazy(() => import('@/pages/user/TradingPage'));
const LeaderboardPage = lazy(() => import('@/pages/user/LeaderboardPage'));
const ChatPage = lazy(() => import('@/pages/user/ChatPage'));
const OKXTradingPage = lazy(() => import('@/pages/user/OKXTradingPage'));
const TransferHistoryPage = lazy(() => import('@/pages/user/TransferHistoryPage'));
const CommunityPage = lazy(() => import('@/pages/user/CommunityPage'));
const AuditLogPage = lazy(() => import('@/pages/owner/AuditLogPage'));
const TokenLookupPage = lazy(() => import('@/pages/user/TokenLookupPage'));
const PortfolioPage = lazy(() => import('@/pages/user/PortfolioPage'));
const MiniGamesPage = lazy(() => import('@/pages/user/MiniGamesPage'));
const AiMemoryPage = lazy(() => import('@/pages/user/AiMemoryPage'));
const CheckinAdminPage = lazy(() => import('@/pages/owner/CheckinAdminPage'));
const MemeScannerPage = lazy(() => import('@/pages/user/MemeScannerPage'));
const DiscoveryPage = lazy(() => import('@/pages/user/DiscoveryPage'));
const AiTraderPage = lazy(() => import('@/pages/user/AiTraderPage'));
const UserGroupsPage = lazy(() => import('@/pages/user/UserGroupsPage'));
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function SuspenseWrapper({ children }) {
    return (
        <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
                {children}
            </Suspense>
        </ErrorBoundary>
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
                        <Route index element={<SuspenseWrapper><CommunityPage /></SuspenseWrapper>} />
                    )}
                    <Route path="overview" element={<SuspenseWrapper><DashboardPage /></SuspenseWrapper>} />
                    <Route path="users" element={isOwnerView() ? <SuspenseWrapper><UsersPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="groups" element={isOwnerView() ? <SuspenseWrapper><GroupsPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="analytics" element={<SuspenseWrapper><AnalyticsPage /></SuspenseWrapper>} />
                    <Route path="alerts" element={<SuspenseWrapper><AlertsPage /></SuspenseWrapper>} />
                    <Route path="posts" element={isOwnerView() ? <SuspenseWrapper><PostsPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    <Route path="config" element={isOwnerView() ? <SuspenseWrapper><ConfigPage /></SuspenseWrapper> : <Navigate to="/" />} />
                    {/* User Routes */}
                    <Route path="chat" element={<SuspenseWrapper><ChatPage /></SuspenseWrapper>} />
                    <Route path="my-space" element={<SuspenseWrapper><CommunityPage /></SuspenseWrapper>} />
                    <Route path="settings" element={<SuspenseWrapper><SettingsPage /></SuspenseWrapper>} />
                    <Route path="wallets" element={<SuspenseWrapper><WalletsPage /></SuspenseWrapper>} />
                    <Route path="trading" element={<SuspenseWrapper><TradingPage /></SuspenseWrapper>} />
                    <Route path="leaderboard" element={<SuspenseWrapper><LeaderboardPage /></SuspenseWrapper>} />
                    <Route path="okx-trading" element={<SuspenseWrapper><OKXTradingPage /></SuspenseWrapper>} />
                    <Route path="history" element={<SuspenseWrapper><TransferHistoryPage /></SuspenseWrapper>} />
                    <Route path="community" element={<Navigate to="/my-space" />} />
                    <Route path="profile" element={<Navigate to="/my-space" />} />
                    <Route path="token-lookup" element={<SuspenseWrapper><TokenLookupPage /></SuspenseWrapper>} />
                    <Route path="portfolio" element={<SuspenseWrapper><PortfolioPage /></SuspenseWrapper>} />
                    <Route path="games" element={<SuspenseWrapper><MiniGamesPage /></SuspenseWrapper>} />
                    <Route path="ai-memory" element={<SuspenseWrapper><AiMemoryPage /></SuspenseWrapper>} />
                    <Route path="ai-trader" element={<SuspenseWrapper><AiTraderPage /></SuspenseWrapper>} />
                    <Route path="meme-scanner" element={<SuspenseWrapper><MemeScannerPage /></SuspenseWrapper>} />
                    <Route path="discovery" element={<SuspenseWrapper><DiscoveryPage /></SuspenseWrapper>} />
                    <Route path="my-groups" element={<SuspenseWrapper><UserGroupsPage /></SuspenseWrapper>} />
                    <Route path="checkin-admin" element={isOwnerView() ? <SuspenseWrapper><CheckinAdminPage /></SuspenseWrapper> : <Navigate to="/" />} />
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
