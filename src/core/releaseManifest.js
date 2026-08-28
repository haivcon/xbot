'use strict';

const fs = require('fs');
const path = require('path');

const UNKNOWN_RELEASE = Object.freeze({
    gitSha: 'unknown',
    shortSha: 'unknown',
    builtAt: 'unknown',
    manifestVersion: 'unknown'
});

function isValidIsoTimestamp(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && new Date(value).toISOString() === value;
}

function summarizeManifest(manifest) {
    if (!manifest || manifest.manifestVersion !== 1
        || !/^[a-f0-9]{40}$/.test(manifest.gitSha)
        || !isValidIsoTimestamp(manifest.builtAt)) {
        return { ...UNKNOWN_RELEASE };
    }
    return {
        gitSha: manifest.gitSha,
        shortSha: manifest.gitSha.slice(0, 7),
        builtAt: manifest.builtAt,
        manifestVersion: manifest.manifestVersion
    };
}

function loadReleaseManifest(manifestPath = path.join(__dirname, '../../release-manifest.json')) {
    try {
        return summarizeManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    } catch {
        return { ...UNKNOWN_RELEASE };
    }
}

module.exports = { UNKNOWN_RELEASE, isValidIsoTimestamp, loadReleaseManifest, summarizeManifest };
