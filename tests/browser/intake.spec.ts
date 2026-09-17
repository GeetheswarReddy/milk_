import { test, expect, type Page } from '@playwright/test';
const uid = '10000000-0000-4000-8000-000000000001';
async function prepare(page: Page) {
 const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now()/1000)+3600, role: 'authenticated' })).toString('base64url'), 'test'].join('.');
 await page.route('https://browser-test.supabase.co/**', async route => {
  const url = route.request().url();
  if (url.includes('/auth/v1/')) return route.fulfill({ json: { access_token: jwt, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user: { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true } } });
  return route.fulfill({ json: { ok: true } });
 });
 await page.goto('/');
 await page.getByLabel('Rate per accepted liter (INR)').fill('40');
 await page.getByLabel('I understand this browser holds my workspace access.').check();
 await page.getByRole('button', {name: 'Set up this phone'}).click();
 await expect(page.getByRole('heading', {name: 'Confirm your session.'})).toBeVisible();
 await page.getByLabel('Collection date').fill('2026-09-16');
 await page.getByRole('button', {name: 'Confirm session & continue'}).click();
 await page.getByLabel('Unique numeric farmer ID').fill('101');
 await page.getByLabel('Farmer name', {exact: true}).fill('Asha (fictional)');
 await page.getByRole('button', {name: 'Register & start delivery'}).click();
 await expect(page.getByLabel('Volume (L)')).toBeVisible();
 await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
}
async function saveAccepted(page: Page, volume='12.50') {
 await page.getByLabel('Volume (L)').fill(volume);
 await page.getByLabel('Fat (%)', {exact:true}).fill('4.20');
 await page.getByRole('button', {name: 'Save accepted can'}).click();
 await expect(page.getByText('✓ Can saved on this phone.', {exact:true})).toBeVisible();
}
test('mobile mixed intake, correction reload, summary date, repeat visit and walkthrough captures', async ({page}) => {
 await prepare(page);
 await page.getByLabel('Volume (L)').fill('12.50');
 await page.getByLabel('Fat (%)', {exact:true}).fill('4.20');
 await page.screenshot({path:'public/screenshots/can.png',fullPage:true,style:'.bottom{position:static}main{padding-bottom:20px}'});
 await page.getByRole('button',{name:'Save accepted can'}).click();
 await expect(page.getByLabel('Volume (L)')).toHaveValue('');
 await page.getByLabel('Volume (L)').fill('8');
 await page.getByLabel('× Reject', {exact:true}).check();
 await page.getByLabel('Fat was not measured').check();
 await page.getByRole('combobox', {name:'Rejection reason', exact:true}).selectOption('Sour smell');
 await page.getByLabel('If no photo: explain why unavailable').fill('Camera unavailable');
 await page.screenshot({path:'public/screenshots/rejection.png',fullPage:true,style:'.bottom{position:static}main{padding-bottom:20px}'});
 await page.getByRole('button',{name:'Save rejected can'}).click();
 await page.getByRole('button',{name:'Finish delivery',exact:true}).click();
 await page.screenshot({path:'public/screenshots/farmer.png',fullPage:true,style:'.bottom{position:static}main{padding-bottom:20px}'});
 await page.getByRole('button',{name:'Daily summary',exact:true}).click();
 await expect(page.locator('.stat').first()).toContainText('12.50 L');
 await expect(page.locator('.stat').nth(1)).toContainText('500.00');
 await page.screenshot({path:'public/screenshots/summary.png',fullPage:true,style:'.bottom{position:static}main{padding-bottom:20px}'});
 await page.getByRole('button',{name:'Correct',exact:true}).first().click();
 await page.getByLabel('Volume (L)').fill('10');
 await page.getByLabel('Correction reason').fill('Corrected scale reading');
 // Wait for the durable draft, not merely a DOM input update.
 await expect.poll(async()=>page.evaluate(()=>new Promise<string>(resolve=>{const r=indexedDB.open('dairy-intake-v1');r.onsuccess=()=>{const db=r.result;const q=db.transaction('state').objectStore('state').get('ledger');q.onsuccess=()=>{resolve(q.result.ledger.draft?.correctionReason??'');db.close();};};}))).toBe('Corrected scale reading');
 await page.reload();
 await page.getByRole('button',{name:'Confirm session & continue'}).click();
 await expect(page.getByRole('button',{name:'Save correction'})).toBeVisible();
 await expect(page.getByLabel('Correction reason')).toHaveValue('Corrected scale reading');
 await page.getByRole('button',{name:'Save correction'}).click();
 await expect(page.locator('.stat').first()).toContainText('10.00 L');
 await expect(page.locator('.entry')).toHaveCount(2);
 await page.getByRole('button',{name:'Continue collection'}).click();
 page.once('dialog', d=>d.accept());
 await page.getByRole('button',{name:/Asha \(fictional\)/}).click();
 await page.getByRole('button',{name:'Daily summary',exact:true}).click();
 await page.getByLabel('Collection date').fill('2026-09-15');
 await page.getByRole('button',{name:'Continue collection'}).click();
 await expect(page.locator('.context')).toContainText('2026-09-16');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('prepared production shell reopens offline and saves under slow network without server dependency', async ({page,context})=>{
 await prepare(page);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:2000,downloadThroughput:6250,uploadThroughput:2500});
 const start=Date.now();await saveAccepted(page);expect(Date.now()-start).toBeLessThan(10000);
 await context.setOffline(true);
 await page.close();
 const reopened=await context.newPage();await reopened.goto('/');
 await expect(reopened.locator('#app')).not.toBeEmpty({timeout:10000});
 await reopened.getByRole('button',{name:'Confirm session & continue'}).click();
 await saveAccepted(reopened,'5');
 await reopened.getByRole('button',{name:'Finish delivery',exact:true}).click();
 await reopened.getByRole('button',{name:'Daily summary',exact:true}).click();
 await expect(reopened.locator('.stat').first()).toContainText('17.50 L');
 await expect(reopened.getByText('Record pending',{exact:true}).first()).toBeVisible();
});
