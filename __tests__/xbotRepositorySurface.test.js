const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(ROOT, relativePath));
const isTracked = relativePath => {
    if (!exists('.git')) return exists(relativePath);
    try {
        execFileSync('git', ['ls-files', '--error-unmatch', relativePath], { cwd: ROOT, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
};

describe('xBot-only repository surface', () => {
    test('standalone ecosystem landing, docs, and xKey copies are absent', () => {
        for (const relativePath of [
            'dashboard/index.html',
            'dashboard/src-landing',
            'dashboard/docs',
            'dashboard/src-docs',
            'dashboard/xKey',
            'dashboard/public/xkey-logo.png',
            'dashboard/public/xkey-splash.png',
            'dashboard/public/xmusic-logo.jpg'
        ]) {
            expect(exists(relativePath)).toBe(false);
        }
    });

    test('the retained dashboard build has exactly the xBot HTML entry', () => {
        const viteConfig = read('dashboard/vite.config.js');
        expect(viteConfig).toContain("xbot: path.resolve(__dirname, 'xBot/index.html')");
        expect(viteConfig).not.toMatch(/src-landing|src-docs|xKey\/index\.html|docs\/index\.html|main:\s*path\.resolve/);

        expect(exists('dashboard/xBot/index.html')).toBe(true);
        expect(exists('dashboard/xBot/src/pages/LandingPage.jsx')).toBe(true);
        expect(read('dashboard/xBot/index.html')).not.toMatch(/xlayer\.my|href="\/"/);
        expect(read('dashboard/xBot/src/main.jsx')).toContain('<BrowserRouter basename="/xBot">');
        expect(read('dashboard/xBot/src/api/client.js')).toContain("window.location.href = '/xBot/'");
    });

    test('runtime serves only the xBot entry', () => {
        const apiServer = read('src/server/apiServer.js');
        expect(apiServer).toContain("res.redirect('/xBot/')");
        expect(apiServer).toContain("path.join(__dirname, '../../dashboard/dist/xBot')");
        expect(apiServer).toContain("app.use('/xBot', express.static(dashboardDist))");
        expect(apiServer).toContain("path.join(dashboardDist, 'index.html')");

        const dashboardRoutes = read('src/server/dashboardRoutes.js');
        expect(dashboardRoutes).toContain('res.json({ botUsername: botUsername || null })');
        expect(dashboardRoutes).not.toContain("dashboardUrl: `${req.protocol}://${req.get('host')}/xBot/`");
        expect(dashboardRoutes).not.toContain('href="/dashboard/"');
    });

    test('PWA shell starts and falls back at the xBot route', () => {
        const manifest = JSON.parse(read('dashboard/public/manifest.json'));
        expect(manifest.start_url).toBe('/xBot/');

        const serviceWorker = read('dashboard/public/sw.js');
        expect(serviceWorker).toContain("const SHELL_URLS = ['/xBot/', '/xBot/index.html']");
        expect(serviceWorker).toContain("caches.match('/xBot/')");
    });

    test('committed build and release contracts require only retained xBot artifacts', () => {
        const viteConfig = read('dashboard/vite.config.js');
        expect(viteConfig).toContain("root: path.resolve(__dirname, 'xBot')");
        expect(viteConfig).toContain("outDir: path.resolve(__dirname, 'dist/xBot')");
        expect(viteConfig).toContain("xbot: path.resolve(__dirname, 'xBot/index.html')");

        const releaseManifest = read('scripts/generate-release-manifest.js');
        expect(releaseManifest).toContain("'dashboard/dist/xBot/index.html'");
        expect(releaseManifest).toContain("'dashboard/dist/xBot/.vite/manifest.json'");
        expect(releaseManifest).not.toMatch(/dist\/(?:index\.html|xKey\/|docs\/)/);
    });

    test('README deployment references are portable from a tracked checkout', () => {
        const readme = read('README.md');
        const deploySection = readme.match(/## Deploy\r?\n([\s\S]*?)\r?\n## License/)?.[1] || '';
        const trackedPaths = [
            'dashboard/vite.config.js',
            'scripts/generate-release-manifest.js',
            'src/core/releaseManifest.js',
            'src/core/readiness.js'
        ];

        expect(deploySection).toContain('npm --prefix dashboard run build');
        expect(deploySection).toContain('npm run release:manifest');
        expect(deploySection).toContain('/health');
        expect(deploySection).toContain('/readyz');
        for (const relativePath of trackedPaths) {
            expect(deploySection).toContain(`\`${relativePath}\``);
            expect(isTracked(relativePath)).toBe(true);
        }
        expect(deploySection).not.toContain('scripts/deploy.sh');
    });

    test('OAuth deployment docs distinguish upstream native clients from xBot web clients', () => {
        const readme = read('README.md');
        const projectContext = read('.hermes.md');

        for (const content of [readme, projectContext]) {
            expect(content).toContain('public/native OAuth client');
            expect(content).toContain('loopback');
            expect(content).toContain('cannot authorize the xBot HTTPS callback');
        }
        expect(readme).toContain('Google OAuth web clients owned by the xBot operator');
        expect(readme).not.toContain('corresponding provider consoles');
    });
});
