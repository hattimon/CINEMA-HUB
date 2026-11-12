import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const linuxChromium = process.platform === 'linux' && process.env.CHROMIUM_PATH && process.env.DISPLAY;

test('Filman opens a regular browser and reuses the saved profile and browser user agent', { skip: !linuxChromium, timeout: 40000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cinema-filman-login-'));
  process.env.DATA_DIR = directory;
  process.env.FILMAN_BROWSER_DISPLAY ||= process.env.DISPLAY;
  const { SourceBrowser } = await import('../server/browser.mjs');
  const { db } = await import('../server/store.mjs');
  const browser = new SourceBrowser();
  const observed = Promise.withResolvers();
  const fixture = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (url.pathname === '/logowanie') {
      res.setHeader('Set-Cookie', 'fixture_login=active; Max-Age=300; Path=/; HttpOnly; SameSite=Lax');
      res.end('<title>Logowanie Filmana</title><script>fetch("/probe?webdriver="+navigator.webdriver)</script>');
    } else if (url.pathname === '/probe') {
      observed.resolve({ webdriver: url.searchParams.get('webdriver'), userAgent: req.headers['user-agent'] });
      res.end();
    } else if (url.pathname === '/catalog') {
      const signedIn = String(req.headers.cookie).split('; ').includes('fixture_login=active');
      res.end(JSON.stringify({ signedIn, userAgent: req.headers['user-agent'] }));
    } else {
      res.writeHead(404).end();
    }
  });
  let deadline;
  try {
    await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
    const source = { type: 'filman', id: randomUUID().replaceAll('-', ''), url: `http://127.0.0.1:${fixture.address().port}/` };
    const session = await browser.openLogin(source, 'owner');
    assert.equal(session.url, '/connect');
    const manual = await Promise.race([
      observed.promise,
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('The manual browser did not open the login form')), 12000); }),
    ]);
    assert.equal(manual.webdriver, 'false');
    assert.match(manual.userAgent, / Chrome\//);
    assert.equal(await browser.finishLogin('another-user'), false);
    const catalogURL = new URL('catalog', source.url).href;
    await assert.rejects(browser.page(source, catalogURL, () => {}), { status: 409 });
    assert.equal(await browser.finishLogin('owner'), true);
    assert.equal(browser.lease, null);
    const catalog = await browser.page(source, catalogURL, async page => JSON.parse(await page.locator('body').innerText()));
    assert.equal(catalog.signedIn, true);
    assert.equal(catalog.userAgent, manual.userAgent);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await new Promise(resolve => fixture.close(resolve));
    db.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'cinema-filman-login-')));
    await rm(directory, { recursive: true, force: true });
  }
});
