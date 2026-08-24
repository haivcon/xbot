import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(dashboardRoot, '..');
const manifest = JSON.parse(await readFile(path.join(dashboardRoot, 'public/providers/provenance.json'), 'utf8'));
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'xbot-provider-assets-'));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port: assignedPort } = server.address();
    server.close(error => error ? reject(error) : resolve(assignedPort));
  });
});
const server = spawn(process.execPath, ['--require', path.join(dashboardRoot, 'scripts/root-server-test-preload.cjs'), 'safe-wrapper.js'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    DOTENV_CONFIG_PATH: path.join(tempDir, 'no-env'),
    API_PORT: String(port),
    HOST: '127.0.0.1',
    EXECUTION_DISABLED: 'true',
    ROUTER_ENABLED: 'false',
    XBOT_AGENT_ENABLED: 'false',
    USE_WEBHOOK: 'false',
    PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    TELEGRAM_TOKEN: ['123456789', 'A'.repeat(35)].join(':'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });
const base = `http://127.0.0.1:${port}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  let htmlResponse;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      htmlResponse = await fetch(`${base}/xBot/`);
      if (htmlResponse.ok) break;
    } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!htmlResponse?.ok) throw new Error(`root xBot server did not become ready\n${serverLog}`);

  const html = await htmlResponse.text();
  const localHtmlResources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(resource => resource.startsWith('/'));
  const results = [{ file: '/xBot/', status: htmlResponse.status, type: htmlResponse.headers.get('content-type') }];
  let bundleSource = '';
  for (const resource of localHtmlResources) {
    const response = await fetch(`${base}${resource}`, { redirect: 'manual' });
    const bytes = Buffer.from(await response.arrayBuffer());
    results.push({ file: resource, status: response.status, type: response.headers.get('content-type'), bytes: bytes.length });
    if (resource.endsWith('.js')) bundleSource += bytes.toString('utf8');
  }
  const builtAssets = await readdir(path.join(dashboardRoot, 'dist/xBot/assets'));
  for (const file of builtAssets.filter(file => /\.(?:js|css)$/.test(file))) {
    const resource = `/xBot/assets/${file}`;
    if (localHtmlResources.includes(resource)) continue;
    const response = await fetch(`${base}${resource}`, { redirect: 'manual' });
    const bytes = Buffer.from(await response.arrayBuffer());
    results.push({ file: resource, status: response.status, type: response.headers.get('content-type'), bytes: bytes.length });
    if (file.endsWith('.js')) bundleSource += bytes.toString('utf8');
  }

  for (const [id, entry] of Object.entries(manifest.providers)) {
    const canonicalPath = `/xBot/${entry.publicPath}`;
    const response = await fetch(`${base}${canonicalPath}`, { redirect: 'manual' });
    const bytes = Buffer.from(await response.arrayBuffer());
    results.push({ file: canonicalPath, status: response.status, type: response.headers.get('content-type'), bytes: bytes.length, sha256: sha256(bytes), expectedSha256: entry.sha256 });

    const oldPath = `/${entry.publicPath}`;
    const oldResponse = await fetch(`${base}${oldPath}`, { redirect: 'manual' });
    results.push({ file: oldPath, status: oldResponse.status, oldPath: true });
  }

  const broken = results.filter(result => !result.oldPath && (
    result.status !== 200
    || (result.file.includes('/providers/') && (!result.type?.startsWith('image/') || !result.bytes || result.sha256 !== result.expectedSha256))
  ));
  const unsafeOldPaths = results.filter(result => result.oldPath && result.status !== 404);
  const remoteIconUrls = (bundleSource.match(/https?:\/\/[^"'\s]+\/providers\/[^"'\s]+\.(?:png|svg|webp)/gi) || []).length;
  const referencedIcons = Object.values(manifest.providers).filter(entry => bundleSource.includes(path.basename(entry.publicPath)));
  const expectedIconRefs = Object.keys(manifest.providers).length;
  const summary = { checked: results.length, broken: broken.length, unsafeOldPaths: unsafeOldPaths.length, remoteIconUrls, referencedIcons: referencedIcons.length, expectedIconRefs, results };
  console.log(JSON.stringify(summary, null, 2));
  if (broken.length || unsafeOldPaths.length || remoteIconUrls || referencedIcons.length !== expectedIconRefs) process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 6000)),
  ]);
  if (!server.killed) server.kill('SIGKILL');
}
