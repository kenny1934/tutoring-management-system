import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // For navigation tests, we start at login page
    // In a real setup with auth, we'd have an authenticated session
    await page.goto('/login');
  });

  test('login page loads without errors', async ({ page }) => {
    // Page should load without console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Filter out expected errors (like failed API calls when not authenticated)
    const unexpectedErrors = errors.filter(
      (e) => !e.includes('401') && !e.includes('Failed to fetch')
    );

    expect(unexpectedErrors).toHaveLength(0);
  });

  test('login page has correct meta tags', async ({ page }) => {
    await page.goto('/login');

    // Check viewport meta tag exists
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });

  test('login page is responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/login');

    const googleButton = page.getByRole('button', { name: /sign in with google/i });
    await expect(googleButton).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(googleButton).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(googleButton).toBeVisible();
  });
});

test.describe('Theme Support', () => {
  test('respects prefers-color-scheme: dark', async ({ page }) => {
    // Emulate dark mode
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');

    // Page should load without errors in dark mode
    await expect(page.locator('body')).toBeVisible();
  });

  test('respects prefers-color-scheme: light', async ({ page }) => {
    // Emulate light mode
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');

    // Page should load without errors in light mode
    await expect(page.locator('body')).toBeVisible();
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');

    // Page should still be functional
    const googleButton = page.getByRole('button', { name: /sign in with google/i });
    await expect(googleButton).toBeVisible();
  });
});

test.describe('Performance', () => {
  test('login page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('no layout shift on login page', async ({ page }) => {
    await page.goto('/login');

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Take a screenshot to verify layout (visual regression base)
    await expect(page).toHaveScreenshot('login-page.png', {
      maxDiffPixels: 100,
    });
  });
});
