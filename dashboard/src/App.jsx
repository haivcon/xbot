import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import useThemeStore from '@/stores/themeStore';
import Layout from '@/components/layout/Layout';
import LoginModal from '@/components/LoginModal';
import NotFoundPage from '@/pages/NotFoundPage';
// Owner pages
import DashboardPage from '@/pages/owner/DashboardPage';
import UsersPage from '@/pages/owner/UsersPage';
import GroupsPage from '@/pages/owner/GroupsPage';
import AnalyticsPage from '@/pages/owner/AnalyticsPage';
import AlertsPage from '@/pages/owner/AlertsPage';
import PostsPage from '@/pages/owner/PostsPage';
import ConfigPage from '@/pages/owner/ConfigPage';
// User pages
import ProfilePage from '@/pages/user/ProfilePage';
import SettingsPage from '@/pages/user/SettingsPage';
import WalletsPage from '@/pages/user/WalletsPage';
import TradingPage from '@/pages/user/TradingPage';
import LeaderboardPage from '@/pages/user/LeaderboardPage';
// Landing
import LandingPage from '@/pages/LandingPage';

export default function App() {
    const { init, loading, isAuthenticated, isOwner } = useAuthStore();
    const { initTheme } = useThemeStore();
    const [showLogin, setShowLogin] = useState(false);

    useEffect(() => {
        init();
        initTheme();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-surface-900 flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-surface-200/50">Loading XBot Dashboard...</p>
                </div>
            </div>
        );
    }

    // Not authenticated → show landing page with login modal
    if (!isAuthenticated()) {
        return (
            <>
                <LandingPage onLogin={() => setShowLogin(true)} />
                <LoginModal open={showLogin} onClose={() => setShowLogin(false)} />
            </>
        );
    }

    // Authenticated → full dashboard
    return (
        <>
            <Routes>
                <Route path="/" element={<Layout />}>
                    {/* Owner Routes */}
                    {isOwner() ? (
                        <Route index element={<DashboardPage />} />
                    ) : (
                        <Route index element={<ProfilePage />} />
                    )}
                    <Route path="users" element={isOwner() ? <UsersPage /> : <Navigate to="/" />} />
                    <Route path="groups" element={isOwner() ? <GroupsPage /> : <Navigate to="/" />} />
                    <Route path="analytics" element={isOwner() ? <AnalyticsPage /> : <Navigate to="/" />} />
                    <Route path="alerts" element={isOwner() ? <AlertsPage /> : <Navigate to="/" />} />
                    <Route path="posts" element={isOwner() ? <PostsPage /> : <Navigate to="/" />} />
                    <Route path="config" element={isOwner() ? <ConfigPage /> : <Navigate to="/" />} />
                    {/* User Routes */}
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="wallets" element={<WalletsPage />} />
                    <Route path="trading" element={<TradingPage />} />
                    <Route path="leaderboard" element={<LeaderboardPage />} />
                    {/* 404 */}
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </>
    );
}
