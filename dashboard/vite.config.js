import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Generate a short build hash for cache busting
function swVersionPlugin() {
    const hash = crypto.randomBytes(4).toString('hex');
    return {
        name: 'sw-version',
        writeBundle() {
            const swPath = path.resolve(__dirname, 'dist/sw.js');
            if (fs.existsSync(swPath)) {
                let content = fs.readFileSync(swPath, 'utf8');
                content = content.replace('__BUILD_HASH__', hash);
                fs.writeFileSync(swPath, content);
            }
        }
    };
}

export default defineConfig(({ mode }) => ({
    base: '/',
    plugins: [react(), swVersionPlugin()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    // Separate vendor chunks for better caching
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-i18n': ['react-i18next', 'i18next', 'i18next-browser-languagedetector'],
                    'vendor-icons': ['lucide-react'],
                    'vendor-state': ['zustand'],
                },
            },
        },
    },
}));
