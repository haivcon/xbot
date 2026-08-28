'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isValidIsoTimestamp } = require('../src/core/releaseManifest');

const MANIFEST_VERSION = 1;
const HASH_CANDIDATES = [
    'safe-wrapper.js',
    'package-lock.json',
    'dashboard/dist/xBot/index.html',
    'dashboard/dist/xBot/.vite/manifest.json'
];

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])]));
}

function stableStringify(value) {
    return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function buildReleaseManifest({ rootDir, gitSha, builtAt, nodeVersion, packageVersion }) {
    if (!/^[a-f0-9]{40}$/.test(gitSha || '')) throw new Error('A lowercase 40-character Git SHA is required');
    if (!isValidIsoTimestamp(builtAt)) throw new Error('builtAt must be an exact ISO UTC timestamp with milliseconds');
    if (!/^v\d+\.\d+\.\d+/.test(nodeVersion || '')) throw new Error('A Node version is required');
    if (!/^\d+\.\d+\.\d+/.test(packageVersion || '')) throw new Error('A package version is required');

    const hashes = {};
    for (const relativePath of HASH_CANDIDATES) {
        const filePath = path.join(rootDir, relativePath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) hashes[relativePath] = sha256(filePath);
    }
    return sortDeep({ manifestVersion: MANIFEST_VERSION, gitSha, builtAt, nodeVersion, packageVersion, hashes });
}

function parseArguments(argv) {
    const parsed = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs');
        parsed[key.slice(2)] = value;
    }
    return parsed;
}

function main(argv) {
    const args = parseArguments(argv);
    const rootDir = path.resolve(__dirname, '..');
    const packageVersion = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
    const manifest = buildReleaseManifest({
        rootDir,
        gitSha: args['git-sha'],
        builtAt: args['built-at'],
        nodeVersion: process.version,
        packageVersion
    });
    const outputPath = path.resolve(rootDir, args.output || 'release-manifest.json');
    fs.writeFileSync(outputPath, stableStringify(manifest), { encoding: 'utf8', mode: 0o644 });
}

if (require.main === module) {
    try { main(process.argv.slice(2)); } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { HASH_CANDIDATES, MANIFEST_VERSION, buildReleaseManifest, stableStringify };
