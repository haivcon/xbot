import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import useThemeStore from '@/stores/themeStore';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/pages/LoginPage';
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

function ProtectedRoute({ children, ownerOnly = false }) {
    const { isAuthenticated, isOwner } = useAuthStore();
    if (!isAuthenticated()) return <Navigate to="/login" replace />;
    if (ownerOnly && !isOwner()) return <Navigate to="/profile" replace />;
    return children;
}

export default function App() {
    const { init, loading } = useAuthStore();
    const { initTheme } = useThemeStore();

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

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                {/* Owner Routes */}
                <Route index element={<ProtectedRoute ownerOnly><DashboardPage /></ProtectedRoute>} />
                <Route path="users" element={<ProtectedRoute ownerOnly><UsersPage /></ProtectedRoute>} />
                <Route path="groups" element={<ProtectedRoute ownerOnly><GroupsPage /></ProtectedRoute>} />
                <Route path="analytics" element={<ProtectedRoute ownerOnly><AnalyticsPage /></ProtectedRoute>} />
                <Route path="alerts" element={<ProtectedRoute ownerOnly><AlertsPage /></ProtectedRoute>} />
                <Route path="posts" element={<ProtectedRoute ownerOnly><PostsPage /></ProtectedRoute>} />
                <Route path="config" element={<ProtectedRoute ownerOnly><ConfigPage /></ProtectedRoute>} />
                {/* User Routes */}
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="wallets" element={<WalletsPage />} />
                <Route path="trading" element={<TradingPage />} />
                <Route path="leaderboard" element={<LeaderboardPage />} />
                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
