import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import useThemeStore from '@/stores/themeStore';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const { theme } = useThemeStore();

    return (
        <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${theme === 'light' ? 'bg-slate-50' : 'bg-surface-900'}`}>
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <Header onMenuClick={() => setSidebarOpen(true)} />
                <main className={`flex-1 overflow-auto p-4 md:p-6 lg:p-8 transition-colors duration-300 ${theme === 'light' ? 'bg-slate-50' : ''}`}>
                    <div key={location.pathname} className="max-w-7xl mx-auto page-enter">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
