const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_SOURCE = path.join(ROOT, 'dashboard/xBot');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function sourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(absolutePath);
        return /\.(?:html|js|jsx)$/.test(entry.name) ? [absolutePath] : [];
    });
}

const ROOT_ONLY_BRAND_ASSET = /['"]\/(?:xbot-logo\.png|logos\/(?:banmao|niuma|xwizard)\.png|icons\/icon-(?:192|512)\.png|manifest\.json)['"]/g;

describe('dashboard brand assets honor the Vite base path', () => {
    test('dashboard source contains no root-only brand, token, icon, or manifest URLs', () => {
        const violations = sourceFiles(DASHBOARD_SOURCE).flatMap(file => {
            const matches = [...fs.readFileSync(file, 'utf8').matchAll(ROOT_ONLY_BRAND_ASSET)];
            return matches.map(match => `${path.relative(ROOT, file)}:${match[0]}`);
        });

        expect(violations).toEqual([]);
    });

    test('shared asset resolver is Vite-base-safe without duplicate slashes', () => {
        const resolver = read('dashboard/xBot/src/utils/assetUrl.js');
        expect(resolver).toContain('import.meta.env.BASE_URL');
        expect(resolver).toContain("replace(/^\\/+/, '')");
    });

    test('PWA metadata uses deployed xBot image paths', () => {
        const html = read('dashboard/xBot/index.html');
        expect(html).toContain('href="%BASE_URL%xbot-logo.png"');
        expect(html).toContain('href="%BASE_URL%manifest.json"');
        expect(html).toContain('href="%BASE_URL%icons/icon-192.png"');

        const manifest = JSON.parse(read('dashboard/public/manifest.json'));
        expect(manifest.start_url).toBe('/xBot/');
        expect(manifest.scope).toBe('/xBot/');
        expect(manifest.icons.map(icon => icon.src)).toEqual([
            '/xBot/icons/icon-192.png',
            '/xBot/icons/icon-512.png'
        ]);
    });
});
