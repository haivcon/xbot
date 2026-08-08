import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Generate a short build hash for cache busting
function swVersionPlugin() {
    const hash = crypto.randomBytes(4).toString('hex');
    return {
        name: 'sw-version',
        writeBundle(outputOptions) {
            const outputDir = outputOptions.dir
                ? path.resolve(__dirname, outputOptions.dir)
                : path.resolve(__dirname, 'dist');
            const swPath = path.join(outputDir, 'sw.js');
            if (fs.existsSync(swPath)) {
                let content = fs.readFileSync(swPath, 'utf8');
                content = content.replace('__BUILD_HASH__', hash);
                fs.writeFileSync(swPath, content);
            }
        }
    };
}

// Read version from package.json for build-time injection
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig(({ mode }) => ({
    base: '/',
    plugins: [tailwindcss(), react(), swVersionPlugin()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './xBot/src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            }
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                xbot: path.resolve(__dirname, 'xBot/index.html'),
            },
        },
    },
}));
