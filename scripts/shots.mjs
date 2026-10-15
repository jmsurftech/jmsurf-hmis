// Screenshot pages of the HMIS test stack. Usage (inside the playwright image on network hmis-test):
//   node shots.mjs '<json array of paths>' [width] [theme]
// Signs in as the seeded test admin through the API, then saves /w/<name>.png per page and prints console errors.
import { chromium } from 'playwright';
const WEB = process.env.WEB || 'http://hmis-web:3000';
const API = process.env.API || 'http://hmis-api:4000/api';
const paths = JSON.parse(process.argv[2] || '["/"]');
const width = Number(process.argv[3] || 1440);
const theme = process.argv[4] || 'light';
const email = process.env.EMAIL || 'admin@demo.jmsurf.health';
const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: process.env.PASS || 'Demo@1234' }) });
const j = await r.json();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, colorScheme: theme });
await ctx.addInitScript(([t, f, th]) => {
  if (!location.pathname.startsWith('/login') || location.search.includes('keep')) { localStorage.setItem('jmsurf.token', t); if (f) localStorage.setItem('jmsurf.facility', f); }
  localStorage.setItem('jmsurf.theme', th);
}, [j.accessToken, j.user?.facilityIds?.[0], theme]);
for (const p of paths) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
  page.on('response', (res) => { if (res.status() >= 400 && res.url().includes('/api/')) errs.push(`${res.status()} ${res.url().replace(API, '')}`); });
  try {
    await page.goto(WEB + p, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1200);
  } catch (e) { errs.push('NAV ' + String(e).slice(0, 120)); }
  const name = (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[\/?=&]/g, '_')) + `-${width}${theme === 'dark' ? '-dark' : ''}`;
  await page.screenshot({ path: `/w/${name}.png`, fullPage: process.env.FULL !== '0' });
  console.log(`${name}: ${errs.length ? errs.join(' | ') : 'ok'}`);
  await page.close();
}
await browser.close();
