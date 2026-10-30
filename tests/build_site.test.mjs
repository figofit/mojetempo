import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const builder = fileURLToPath(new URL('../scripts/build_site.py', import.meta.url));
const assets = [
  'index.html', 'styles.css', 'app.js', 'domain.mjs', 'storage.mjs',
  'local-storage.mjs', 'sync-rules.mjs', 'places.mjs', 'planning.mjs', 'habits.mjs', 'invitation.mjs', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/LICENSE',
  'manifest.webmanifest', 'service-worker.js', 'pwa.mjs', 'icons/icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tempo-build-test-'));
  const source = join(directory, 'source');
  mkdirSync(join(source, 'scripts'), { recursive: true });
  copyFileSync(builder, join(source, 'scripts', 'build_site.py'));
  for (const asset of assets) {
    const target = join(source, asset);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, asset === 'service-worker.js'
      ? "const CACHE = 'moje-tempo-__TEMPO_VERSION__';\nconst SHELL_INTEGRITY = { /* __TEMPO_INTEGRITY__ */ };\n"
      : asset === 'index.html'
        ? '<meta name="tempo-build" content="__TEMPO_VERSION__">\n'
        : `Test asset: ${asset}\n`);
  }
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, source };
}

function build(current, output) {
  const result = spawnSync('python3', [join(current.source, 'scripts', 'build_site.py'),
    ...(output ? ['--output-dir', output] : [])], { cwd: current.source, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function succeeds(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function files(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path, base) : [relative(base, path).replaceAll('\\', '/')];
  }).sort();
}

test('production artifact contains only public allowlisted assets and generated build files', t => {
  const current = fixture(t);
  for (const privatePath of ['.git/config', '.env', 'tests/private.fixture', 'backups/diary.json', 'README.md']) {
    const path = join(current.source, privatePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'Local fixture content which must not be published.');
  }
  succeeds(build(current));
  const output = join(current.source, 'dist');
  assert.deepEqual(files(output), [...assets, '.nojekyll', '.tempo-build.json'].sort());
  assert.equal(readFileSync(join(output, 'app.js'), 'utf8'), readFileSync(join(current.source, 'app.js'), 'utf8'));
  assert.equal(readFileSync(join(output, 'domain.mjs'), 'utf8'), readFileSync(join(current.source, 'domain.mjs'), 'utf8'));
  assert.equal(readFileSync(join(output, 'storage.mjs'), 'utf8'), readFileSync(join(current.source, 'storage.mjs'), 'utf8'));
  assert.equal(readFileSync(join(output, '.nojekyll'), 'utf8'), '');
  const marker = JSON.parse(readFileSync(join(output, '.tempo-build.json'), 'utf8'));
  assert.equal(marker.app, 'moje-tempo');
  assert.equal(marker.buildFormat, 1);
  const worker = readFileSync(join(output, 'service-worker.js'), 'utf8');
  assert.ok(!worker.includes('__TEMPO_VERSION__'));
  assert.ok(!worker.includes('__TEMPO_INTEGRITY__'));
  assert.match(worker, /[a-f0-9]{64}/);
  const index = readFileSync(join(output, 'index.html'), 'utf8');
  assert.ok(!index.includes('__TEMPO_VERSION__'));
  assert.match(index, /content="[a-f0-9]{64}"/);
  assert.equal(index.match(/[a-f0-9]{64}/)[0], worker.match(/[a-f0-9]{64}/)[0]);
  assert.match(readFileSync(join(current.source, 'service-worker.js'), 'utf8'), /__TEMPO_VERSION__/);
});

test('service worker integrity pins every staged shell asset including the final stamped index', t => {
  const current = fixture(t);
  succeeds(build(current));
  const output = join(current.source, 'dist');
  const worker = readFileSync(join(output, 'service-worker.js'), 'utf8');
  const match = worker.match(/const SHELL_INTEGRITY\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(match, 'The staged worker must contain its integrity mapping.');
  const integrity = JSON.parse(`{${match[1]}}`);
  const protectedAssets = assets.filter(asset => asset !== 'service-worker.js');
  assert.deepEqual(Object.keys(integrity).sort(), protectedAssets.sort());
  for (const asset of protectedAssets) {
    const digest = createHash('sha256').update(readFileSync(join(output, asset))).digest('base64');
    assert.equal(integrity[asset], `sha256-${digest}`, asset);
  }
  assert.ok(!Object.hasOwn(integrity, 'service-worker.js'));
});

test('asset changes invalidate the deployed service worker and repeated builds preserve sources', t => {
  const current = fixture(t);
  const originals = new Map(assets.map(asset => [asset, readFileSync(join(current.source, asset), 'utf8')]));
  succeeds(build(current));
  const worker = join(current.source, 'dist', 'service-worker.js');
  const first = readFileSync(worker, 'utf8');
  succeeds(build(current));
  assert.equal(readFileSync(worker, 'utf8'), first);
  for (const [asset, content] of originals) assert.equal(readFileSync(join(current.source, asset), 'utf8'), content);
  writeFileSync(join(current.source, 'styles.css'), 'Changed stylesheet content.\n');
  succeeds(build(current));
  assert.notEqual(readFileSync(worker, 'utf8'), first);
  assert.equal(readFileSync(join(current.source, 'dist', 'styles.css'), 'utf8'), 'Changed stylesheet content.\n');
});

test('a selected empty output directory can be built and safely refreshed', t => {
  const current = fixture(t);
  const output = join(current.directory, 'selected-output');
  mkdirSync(output);
  succeeds(build(current, output));
  succeeds(build(current, output));
  assert.deepEqual(files(output), [...assets, '.nojekyll', '.tempo-build.json'].sort());
});

test('a foreign nonempty output is rejected without modifying its files', t => {
  const current = fixture(t);
  const output = join(current.directory, 'existing-user-files');
  mkdirSync(output);
  writeFileSync(join(output, 'keep.txt'), 'Keep this user-owned content.');
  const result = build(current, output);
  assert.notEqual(result.status, 0);
  assert.deepEqual(files(output), ['keep.txt']);
  assert.equal(readFileSync(join(output, 'keep.txt'), 'utf8'), 'Keep this user-owned content.');
});

test('unknown user files in a previously marked output are preserved and stop refresh', t => {
  const current = fixture(t);
  succeeds(build(current));
  const output = join(current.source, 'dist');
  const userFile = join(output, 'private-notes.txt');
  writeFileSync(userFile, 'Preserve even when output already has a build marker.');
  assert.notEqual(build(current).status, 0);
  assert.equal(readFileSync(userFile, 'utf8'), 'Preserve even when output already has a build marker.');
});

test('source directories and ancestors cannot become the build output', t => {
  const current = fixture(t);
  const original = readFileSync(join(current.source, 'index.html'), 'utf8');
  const nested = join(current.source, 'generated');
  mkdirSync(nested);
  for (const output of [current.source, current.directory, nested]) {
    assert.notEqual(build(current, output).status, 0, output);
    assert.equal(readFileSync(join(current.source, 'index.html'), 'utf8'), original);
  }
  assert.deepEqual(files(nested), []);
});

test('a missing public asset fails before writing a partial deployment', t => {
  const current = fixture(t);
  rmSync(join(current.source, 'storage.mjs'));
  const output = join(current.directory, 'partial-output');
  const result = build(current, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /storage\.mjs/);
  assert.ok(!existsSync(output) || files(output).length === 0);
});

test('missing service worker integrity placeholder fails without creating an output', t => {
  const current = fixture(t);
  writeFileSync(join(current.source, 'service-worker.js'), "const CACHE = 'moje-tempo-__TEMPO_VERSION__';\n");
  const output = join(current.directory, 'missing-integrity-output');
  const result = build(current, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /integrity/i);
  assert.ok(!existsSync(output) || files(output).length === 0);
});

test('an output symlink cannot redirect the build into user files', { skip: process.platform === 'win32' }, t => {
  const current = fixture(t);
  const actual = join(current.directory, 'user-directory');
  const alias = join(current.directory, 'output-link');
  mkdirSync(actual);
  writeFileSync(join(actual, 'keep.txt'), 'Not a build output.');
  symlinkSync(actual, alias, 'dir');
  assert.notEqual(build(current, alias).status, 0);
  assert.deepEqual(files(actual), ['keep.txt']);
  assert.equal(readFileSync(join(actual, 'keep.txt'), 'utf8'), 'Not a build output.');
});
