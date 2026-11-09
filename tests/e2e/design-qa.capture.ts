import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const referencePath = 'C:/Users/Admin/AppData/Local/Temp/codex-clipboard-1c2e379e-1cba-45e9-af7c-8b956eebcef2.png';
const outputDirectory = resolve('docs/song-homestay');

test('captures desktop, mobile, and a normalized comparison board', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon.ico')) browserErrors.push(message.text());
  });

  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard tổng quan' })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: resolve(outputDirectory, 'design-qa-dashboard-1588x1066.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard tổng quan' })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: resolve(outputDirectory, 'design-qa-dashboard-mobile-390x844.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(browserErrors).toEqual([]);

  const source = readFileSync(referencePath).toString('base64');
  const implementation = readFileSync(resolve(outputDirectory, 'design-qa-dashboard-1588x1066.png')).toString('base64');
  await page.setViewportSize({ width: 3176, height: 1126 });
  await page.setContent(`<!doctype html><style>body{margin:0;background:#111827;color:white;font:600 18px Arial}main{display:grid;grid-template-columns:1588px 1588px}figure{margin:0}figcaption{height:60px;display:flex;align-items:center;padding:0 24px;box-sizing:border-box;background:#0f172a}img{display:block;width:1588px;height:1066px;object-fit:contain;background:white}</style><main><figure><figcaption>NGUỒN THAM CHIẾU</figcaption><img src="data:image/png;base64,${source}"></figure><figure><figcaption>IMPLEMENTATION</figcaption><img src="data:image/png;base64,${implementation}"></figure></main>`);
  await page.screenshot({ path: resolve(outputDirectory, 'design-qa-comparison.png') });
});
