import { test, expect } from '@playwright/test';

test.describe('ChalkboardHeader Artifact Investigation', () => {
  test.beforeEach(async ({ page }) => {
    // Override baseURL to use port 3007
    await page.goto('http://localhost:3007/sessions/9995267');
    // Wait for the page to load - look for the session detail page container
    await page.waitForLoadState('networkidle');
    // Wait a bit for animations to complete
    await page.waitForTimeout(1500);
  });

  test('capture chalkboard header in light mode', async ({ page }) => {
    // Ensure we're in light mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });

    // Wait for theme transition
    await page.waitForTimeout(500);

    // Take full page screenshot
    await page.screenshot({
      path: 'tests/screenshots/chalkboard-header-light-mode.png',
      fullPage: true
    });

    // Take a focused screenshot of just the header area
    // Use a more specific selector for the chalkboard header
    const header = page.locator('[style*="height: 100px"]').first();
    if (await header.count() > 0) {
      await header.screenshot({
        path: 'tests/screenshots/chalkboard-header-light-mode-focused.png'
      });
    }

    console.log('Light mode screenshots captured');
  });

  test('capture chalkboard header in dark mode', async ({ page }) => {
    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });

    // Wait for theme transition
    await page.waitForTimeout(500);

    // Take full page screenshot
    await page.screenshot({
      path: 'tests/screenshots/chalkboard-header-dark-mode.png',
      fullPage: true
    });

    // Take a focused screenshot of just the header area
    const header = page.locator('[style*="height: 100px"]').first();
    if (await header.count() > 0) {
      await header.screenshot({
        path: 'tests/screenshots/chalkboard-header-dark-mode-focused.png'
      });
    }

    console.log('Dark mode screenshots captured');
  });

  test('inspect chalkboard header structure', async ({ page }) => {
    // Get information about the chalkboard header structure
    const headerInfo = await page.evaluate(() => {
      const header = document.querySelector('[style*="height: 100px"]');
      if (!header) return null;

      const computedStyle = window.getComputedStyle(header);
      const children = Array.from(header.children).map(child => {
        const childStyle = window.getComputedStyle(child);
        return {
          className: child.className,
          position: childStyle.position,
          borderRadius: childStyle.borderRadius,
          overflow: childStyle.overflow,
          bottom: childStyle.bottom,
          left: childStyle.left,
          right: childStyle.right,
        };
      });

      return {
        overflow: computedStyle.overflow,
        borderRadius: computedStyle.borderRadius,
        position: computedStyle.position,
        childrenCount: header.children.length,
        children,
      };
    });

    console.log('ChalkboardHeader structure:', JSON.stringify(headerInfo, null, 2));
  });
});
