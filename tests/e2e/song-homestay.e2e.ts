import { expect, test } from '@playwright/test';

test('Sóng Homestay public and admin MVP is ready for the local demo', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon.ico')) {
      browserErrors.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/p\/song-homestay$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sóng Homestay — Đà Nẵng' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Các căn đang mở đặt phòng' })).toBeVisible();
  await expect(page.locator('a[href^="/p/song-homestay/stay/"]')).toHaveCount(5);

  await page.getByRole('link', { name: 'Chỗ nghỉ' }).click();
  await expect(page).toHaveURL(/\/p\/song-homestay\/stays/);
  await expect(page.getByRole('heading', { name: 'Tìm không gian phù hợp với bạn' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main').getByRole('heading', { level: 2 })).toHaveCount(5);

  await page.locator('a[href^="/p/song-homestay/stay/"]').first().click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập để đặt phòng' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Tạo tài khoản' })).toHaveAttribute('href', /\/dang-nhap\?tab=register&next=/);

  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard tổng quan' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Doanh thu trong kỳ', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Quản lý chỗ nghỉ' })).toBeVisible();
  await page.goto('/admin/accommodations');
  await expect(page.getByRole('heading', { name: 'Quản lý chỗ nghỉ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu' })).toHaveCount(5);
  await page.goto('/admin/ical');
  await expect(page.getByRole('heading', { name: 'Đồng bộ dữ liệu iCal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đồng bộ tất cả ngay' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(browserErrors).toEqual([]);
});

test('DEMO_MODE accepts a retained authenticated account without a staff grant', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/admin/login');
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Full name').fill('Tài khoản demo đã lưu');
  await page.getByLabel('Email hoặc tên đăng nhập').fill(`song-retained-${Date.now()}@example.com`);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill('SongHomestay-E2E-2026!');
  await page.locator('form').getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/admin(?:\/dashboard)?$/, { timeout: 20_000 });

  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard tổng quan' })).toBeVisible({ timeout: 20_000 });
  expect(browserErrors).toEqual([]);
});

test('provisions an explicitly requested local staff login', async ({ page }) => {
  const email = process.env.OPENSTAYS_CREATE_STAFF_EMAIL;
  const password = process.env.OPENSTAYS_CREATE_STAFF_PASSWORD;
  test.skip(!email || !password, 'Set OPENSTAYS_CREATE_STAFF_EMAIL and OPENSTAYS_CREATE_STAFF_PASSWORD to provision a local login.');

  await page.goto('/admin/login');
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Full name').fill('Quản trị Sóng Homestay');
  await page.getByLabel('Email hoặc tên đăng nhập').fill(email!);
  await page.getByRole('textbox', { name: 'Mật khẩu' }).fill(password!);
  await page.locator('form').getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/admin(?:\/dashboard)?$/, { timeout: 20_000 });
});
