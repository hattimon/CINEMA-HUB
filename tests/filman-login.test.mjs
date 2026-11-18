import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const linuxChromium = process.platform === 'linux' && process.env.CHROMIUM_PATH && process.env.DISPLAY;

test('Filman uses the saved Chromium session for the catalog and protected posters', { skip: !linuxChromium, timeout: 90000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cinema-filman-login-'));
  process.env.DATA_DIR = directory;
  process.env.BROWSER_CLOSE_AFTER_WORK = 'false';
  process.env.FILMAN_BROWSER_DISPLAY ||= process.env.DISPLAY;
  const { SourceBrowser } = await import('../server/browser.mjs');
  const { db, getFilmanLogin, encrypt } = await import('../server/store.mjs');
  const browser = new SourceBrowser();
  const observed = Promise.withResolvers();
  const posterBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XioAAAAASUVORK5CYII=', 'base64');
  let redirectFollowed = false;
  let confirmLogin;
  let catalogVisits = 0;
  let verificationVisits = 0;
  let completedCheckboxes = 0;
  let useLoginForm = false;
  let expired = false;
  const submittedAccounts = [];
  const loginForm = '<title>Logowanie Filmana</title><form method="post" action="/logowanie"><input name="username" autocomplete="username"><input name="password" type="password"><button type="submit">Zaloguj</button></form>';
  const fixture = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (url.pathname === '/logowanie') {
      if (useLoginForm) {
        if (req.method !== 'POST') return res.end(loginForm);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        const username = form.get('username');
        submittedAccounts.push(username);
        if (form.get('password') !== 'Fixture-pass-for-'+username) return res.end(loginForm);
        expired = false;
        return res.writeHead(303, {
          Location: '/',
          'Set-Cookie': 'fixture_login=active; Max-Age=300; Path=/; HttpOnly; SameSite=Lax',
        }).end();
      }
      res.end('<title>Logowanie Filmana</title><form><input type="password"></form><script>fetch("/probe?webdriver="+navigator.webdriver).then(response=>{if(response.ok)location.assign("/")})</script>');
    } else if (url.pathname === '/probe') {
      observed.resolve({ webdriver: url.searchParams.get('webdriver'), userAgent: req.headers['user-agent'] });
      confirmLogin = () => {
        if (!res.writableEnded) res.writeHead(200, { 'Set-Cookie': 'fixture_login=active; Max-Age=300; Path=/; HttpOnly; SameSite=Lax' }).end();
      };
    } else if (url.pathname === '/') {
      res.end('<title>Filman</title><div id="dropdown">Zalogowany jako: Test</div><div id="item-list"></div><iframe src="/recaptcha-badge"></iframe>');
    } else if (url.pathname === '/recaptcha-badge') {
      res.end('<title>reCAPTCHA</title>');
    } else if (url.pathname === '/catalog') {
      catalogVisits++;
      if (catalogVisits === 1) return res.writeHead(403).end('<title>Access denied</title>');
      const signedIn = String(req.headers.cookie).split('; ').includes('fixture_login=active');
      res.end('<title>Katalog</title><body>'+JSON.stringify({ signedIn, userAgent: req.headers['user-agent'] })+'</body>');
    } else if (url.pathname === '/browser-check') {
      if (url.searchParams.has('complete')) return res.end('<title>Browser check completed</title>');
      res.writeHead(403, { 'cf-mitigated': 'challenge' }).end('<title>Just a moment</title><script>setTimeout(()=>location.replace("/browser-check?complete=1"),1000)</script>');
    } else if (url.pathname === '/checkbox-verification') {
      if (url.searchParams.has('complete')) {
        completedCheckboxes++;
        return res.end('<title>Checkbox completed</title>');
      }
      res.writeHead(403, { 'cf-mitigated': 'challenge' }).end('<title>Just a moment</title><form id="challenge-form"><input type="checkbox" onchange="location.replace(\'/checkbox-verification?complete=1\')"></form>');
    } else if (url.pathname === '/member-only') {
      if (expired || !String(req.headers.cookie).includes('fixture_login=active')) {
        return res.writeHead(303, {
          Location: '/logowanie',
          'Set-Cookie': 'fixture_login=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
        }).end();
      }
      res.end('<title>Member area</title><div id="dropdown">Zalogowany jako: Test</div>');
    } else if (url.pathname === '/verification') {
      verificationVisits++;
      res.writeHead(403, { 'cf-mitigated': 'challenge' }).end('<title>Just a moment</title><form id="challenge-form"></form>');
    } else if (url.pathname === '/signed-out') {
      res.writeHead(302, { Location: '/logowanie-wymagane' }).end();
    } else if (url.pathname === '/logowanie-wymagane') {
      res.end('<title>Logowanie Filmana</title><input type="password">');
    } else if (url.pathname === '/public/static/poster/fixture.png') {
      if (!String(req.headers.cookie).includes('fixture_login=active')) return res.writeHead(403, { 'cf-mitigated': 'challenge' }).end();
      res.writeHead(200, { 'Content-Type': 'image/png' }).end(posterBytes);
    } else if (url.pathname === '/public/static/poster/redirect.png') {
      res.writeHead(302, { Location: '/redirect-target' }).end();
    } else if (url.pathname === '/redirect-target') {
      redirectFollowed = true;
      res.end();
    } else {
      res.writeHead(404).end();
    }
  });
  let deadline;
  try {
    await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
    const source = { type: 'filman', id: randomUUID().replaceAll('-', ''), url: `http://127.0.0.1:${fixture.address().port}/` };
    const owner = db.prepare("SELECT id FROM users WHERE username='admin'").get().id;
    db.prepare('INSERT INTO sources(id,user_id,name,type,url,secret) VALUES(?,?,?,?,?,?)')
      .run(source.id,owner,'Fixture Filman',source.type,source.url,encrypt({}));
    const session = await browser.openLogin(source, 'owner');
    const sessionId = new URL(session.url, source.url).searchParams.get('session');
    assert.ok(sessionId);
    const manual = await Promise.race([
      observed.promise,
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('The manual browser did not open the login form')), 12000); }),
    ]);
    assert.equal(manual.webdriver, 'false');
    assert.match(manual.userAgent, / Chrome\//);
    assert.equal(await browser.finishLogin('another-user'), false);
    const catalogURL = new URL('catalog', source.url).href;
    await assert.rejects(browser.page(source, catalogURL, () => {}), { status: 409 });
    assert.equal(browser.loginStatus('owner', sessionId).active, true);
    assert.equal(await browser.finishLogin('owner', {sessionId: randomUUID()}), false);
    confirmLogin();
    for (let attempt = 0; attempt < 60 && !browser.loginStatus('owner', sessionId).saved; attempt++) await delay(100);
    assert.equal(browser.loginStatus('owner', sessionId).saved, true);
    assert.equal(browser.loginStatus('another-user', sessionId).saved, false);
    assert.equal(browser.lease, null);
    const catalog = await browser.page(source, catalogURL, async page => ({
      ...JSON.parse(await page.locator('body').innerText()),
      webdriver: await page.evaluate(() => navigator.webdriver),
    }));
    assert.equal(catalog.signedIn, true);
    assert.equal(catalog.userAgent, manual.userAgent);
    assert.equal(String(catalog.webdriver), manual.webdriver);
    assert.equal(catalogVisits, 2);
    assert.match(await browser.page(source, new URL('browser-check', source.url).href, page => page.title()), /Browser check completed/);
    assert.equal(await browser.page(source, new URL('checkbox-verification', source.url).href, page => page.title()), 'Checkbox completed');
    assert.equal(completedCheckboxes, 1);
    await assert.rejects(browser.page(source, new URL('verification', source.url).href, () => {}), {status:409,requiresAction:true});
    assert.equal(verificationVisits, 1);
    await assert.rejects(browser.page(source, new URL('signed-out', source.url).href, () => {}), {status:409,requiresAction:true});
    const posterURL = new URL('public/static/poster/fixture.png', source.url).href;
    assert.equal((await fetch(posterURL)).status, 403);
    assert.deepEqual(await browser.poster(source, posterURL), { type: 'image/png', body: posterBytes });
    assert.equal(await browser.poster(source, new URL('public/static/poster/redirect.png', source.url).href), null);
    assert.equal(redirectFollowed, false);
    assert.equal(getFilmanLogin(source), undefined);

    useLoginForm = true;
    for (const username of ['fixture-first', 'fixture-second']) {
      const {url} = await browser.openLogin(source, 'owner', {switchAccount:true});
      const id = new URL(url, source.url).searchParams.get('session');
      assert.equal(browser.loginStatus('owner', id).switchableSourceId, source.id);
      assert.equal(browser.loginStatus('another-user', id).switchableSourceId, undefined);
      assert.equal(getFilmanLogin(source), undefined);
      const manualBrowser = await chromium.connectOverCDP(await browser.lease.browser.endpoint());
      const context = manualBrowser.contexts()[0];
      assert.equal((await context.cookies(source.url)).some(cookie => cookie.name==='fixture_login'), false);
      const page = context.pages()[0];
      await page.locator('input[name="username"]').fill(username);
      await page.locator('input[name="password"]').fill('rejected-password');
      await Promise.all([
        page.waitForNavigation(),
        page.locator('button[type="submit"]').click(),
      ]);
      assert.equal(getFilmanLogin(source), undefined);
      const password = 'Fixture-pass-for-'+username;
      await page.locator('input[name="username"]').fill(username);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      for (let attempt=0;attempt<60&&!browser.loginStatus('owner',id).saved;attempt++) await delay(100);
      assert.equal(browser.loginStatus('owner',id).saved,true);
      assert.deepEqual(getFilmanLogin(source),{username,password});
      const {secret} = db.prepare('SELECT secret FROM filman_logins WHERE source_id=?').get(source.id);
      assert.ok(!secret.includes(username)&&!secret.includes(password));
      expired=true;
      assert.equal(await browser.page(source,new URL('member-only',source.url).href,page=>page.title()),'Member area');
      assert.equal(submittedAccounts.at(-1),username);
    }
    assert.deepEqual(submittedAccounts,['fixture-first','fixture-first','fixture-first','fixture-second','fixture-second','fixture-second']);
  } finally {
    confirmLogin?.();
    clearTimeout(deadline);
    await browser.close();
    await new Promise(resolve => fixture.close(resolve));
    db.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'cinema-filman-login-')));
    await rm(directory, { recursive: true, force: true });
  }
});
