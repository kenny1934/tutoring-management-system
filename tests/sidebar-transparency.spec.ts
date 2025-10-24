import { test, expect } from '@playwright/test';

test.describe('Sidebar Transparency', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    // Wait for the sidebar to be visible
    await page.waitForSelector('nav');
  });

  test('sidebar should have transparent background in light mode', async ({ page }) => {
    // Ensure we're in light mode by removing dark class if present
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });

    // Wait a bit for any transitions
    await page.waitForTimeout(500);

    // Get the sidebar element (the main container div)
    const sidebar = page.locator('div.flex.h-screen.flex-col.backdrop-blur-md').first();

    // Get computed background color
    const backgroundColor = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Check if background color is transparent (rgba with alpha < 1)
    // Light mode should be rgba(255, 255, 255, 0.6)
    console.log('Light mode background color:', backgroundColor);

    // Parse the rgba value
    const rgbaMatch = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    expect(rgbaMatch).toBeTruthy();

    if (rgbaMatch) {
      const [, r, g, b, a] = rgbaMatch;
      const alpha = a ? parseFloat(a) : 1;

      // Verify it's white-ish (light mode)
      expect(parseInt(r)).toBeGreaterThan(200);
      expect(parseInt(g)).toBeGreaterThan(200);
      expect(parseInt(b)).toBeGreaterThan(200);

      // Verify it's transparent (alpha < 1)
      expect(alpha).toBeLessThan(1);
      expect(alpha).toBeGreaterThan(0);
    }

    // Verify backdrop-filter includes blur
    const backdropFilter = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backdropFilter ||
             window.getComputedStyle(el).webkitBackdropFilter;
    });

    console.log('Backdrop filter:', backdropFilter);
    expect(backdropFilter).toContain('blur');

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'tests/screenshots/sidebar-light-mode.png', fullPage: true });
  });

  test('sidebar should have transparent background in dark mode', async ({ page }) => {
    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });

    // Wait a bit for any transitions
    await page.waitForTimeout(500);

    // Get the sidebar element
    const sidebar = page.locator('div.flex.h-screen.flex-col.backdrop-blur-md').first();

    // Get computed background color
    const backgroundColor = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Check if background color is transparent
    // Dark mode should be rgba(17, 17, 17, 0.6)
    console.log('Dark mode background color:', backgroundColor);

    // Parse the rgba value
    const rgbaMatch = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    expect(rgbaMatch).toBeTruthy();

    if (rgbaMatch) {
      const [, r, g, b, a] = rgbaMatch;
      const alpha = a ? parseFloat(a) : 1;

      // Verify it's dark
      expect(parseInt(r)).toBeLessThan(50);
      expect(parseInt(g)).toBeLessThan(50);
      expect(parseInt(b)).toBeLessThan(50);

      // Verify it's transparent (alpha < 1)
      expect(alpha).toBeLessThan(1);
      expect(alpha).toBeGreaterThan(0);
    }

    // Verify backdrop-filter includes blur
    const backdropFilter = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backdropFilter ||
             window.getComputedStyle(el).webkitBackdropFilter;
    });

    expect(backdropFilter).toContain('blur');

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'tests/screenshots/sidebar-dark-mode.png', fullPage: true });
  });

  test('sidebar transparency persists after collapse/expand', async ({ page }) => {
    // Ensure we're in light mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });

    await page.waitForTimeout(500);

    // Find the collapse/expand toggle button
    const toggleButton = page.locator('button[aria-label*="sidebar"]').first();

    // Get initial background color
    const sidebar = page.locator('div.flex.h-screen.flex-col.backdrop-blur-md').first();
    const initialBgColor = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Initial background color:', initialBgColor);

    // Click to collapse
    await toggleButton.click();
    await page.waitForTimeout(500); // Wait for animation

    // Check background color after collapse
    const collapsedBgColor = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Collapsed background color:', collapsedBgColor);
    expect(collapsedBgColor).toBe(initialBgColor);

    // Take screenshot of collapsed state
    await page.screenshot({ path: 'tests/screenshots/sidebar-collapsed.png', fullPage: true });

    // Click to expand
    await toggleButton.click();
    await page.waitForTimeout(500); // Wait for animation

    // Check background color after expand
    const expandedBgColor = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Expanded background color:', expandedBgColor);
    expect(expandedBgColor).toBe(initialBgColor);

    // Take screenshot of expanded state
    await page.screenshot({ path: 'tests/screenshots/sidebar-expanded.png', fullPage: true });
  });

  test('sidebar width changes smoothly on collapse/expand', async ({ page }) => {
    // Find the sidebar and toggle button
    const sidebar = page.locator('div.flex.h-screen.flex-col.backdrop-blur-md').first();
    const toggleButton = page.locator('button[aria-label*="sidebar"]').first();

    // Get initial width (should be 256px / w-64)
    const initialWidth = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });

    console.log('Initial width:', initialWidth);
    expect(initialWidth).toBe('256px'); // w-64 = 256px

    // Click to collapse
    await toggleButton.click();
    await page.waitForTimeout(400); // Wait for animation (350ms + buffer)

    // Get collapsed width (should be 72px)
    const collapsedWidth = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });

    console.log('Collapsed width:', collapsedWidth);
    expect(collapsedWidth).toBe('72px');

    // Click to expand
    await toggleButton.click();
    await page.waitForTimeout(400);

    // Get expanded width
    const expandedWidth = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });

    console.log('Expanded width:', expandedWidth);
    expect(expandedWidth).toBe('256px');
  });

  test('visual regression: sidebar appearance', async ({ page }) => {
    // This test creates visual regression baselines

    // Light mode expanded
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/screenshots/baseline-light-expanded.png',
      fullPage: true
    });

    // Light mode collapsed
    const toggleButton = page.locator('button[aria-label*="sidebar"]').first();
    await toggleButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/screenshots/baseline-light-collapsed.png',
      fullPage: true
    });

    // Dark mode expanded
    await toggleButton.click(); // Expand again
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/screenshots/baseline-dark-expanded.png',
      fullPage: true
    });

    // Dark mode collapsed
    await toggleButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/screenshots/baseline-dark-collapsed.png',
      fullPage: true
    });
  });
});
