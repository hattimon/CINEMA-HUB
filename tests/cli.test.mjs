import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run against a disposable database; never touch the application's real DATA_DIR.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), 'cinema-cli-regression-'));
process.env.DATA_DIR = directory;
process.env.NODE_ENV = 'test';
const store = await import('../server/store.mjs');

test('reset-password accepts both prompts and invalidates only target sessions', { timeout: 12000 }, async () => {
  const viewer = store.addUser('viewer', 'Original-viewer-9');
  const admin = store.db.prepare('SELECT id FROM users WHERE username=?').get('admin');
  const future = Date.now() + 600000;
  store.db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run('viewer-session', viewer.id, future);
  store.db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run('admin-session', admin.id, future);

  const child = spawn(process.execPath, ['server/cli.mjs', 'reset-password', '--user', 'viewer'], {
    cwd: root, env: { ...process.env, DATA_DIR: directory }, stdio: ['pipe', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '', firstAnswered = false, secondAnswered = false;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', value => { stderr += value; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', value => {
    stdout += value;
    if (!firstAnswered && stdout.includes('Nowe hasło')) {
      firstAnswered = true;
      child.stdin.write('New-viewer-password-9\n');
    }
    if (!secondAnswered && stdout.includes('Powtórz')) {
      secondAnswered = true;
      child.stdin.write('New-viewer-password-9\n');
    }
  });

  const exitCode = await new Promise((resolveResult, reject) => {
    child.once('error', reject);
    child.once('close', code => resolveResult(code));
  });
  assert.equal(exitCode, 0, `reset-password exited ${exitCode}; stdout=${stdout}; stderr=${stderr}`);
  assert.equal(store.db.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id=?').get(viewer.id).count, 0);
  assert.equal(store.db.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id=?').get(admin.id).count, 1);
  assert.equal(store.passwordMatches('New-viewer-password-9', store.db.prepare('SELECT password FROM users WHERE id=?').get(viewer.id).password), true);
});

test.after(() => {
  store.db.close();
  rmSync(directory, { recursive: true, force: true });
});
