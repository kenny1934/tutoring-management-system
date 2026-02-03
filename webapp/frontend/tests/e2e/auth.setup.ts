import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

/**
 * Authentication setup for E2E tests.
 *
 * For local development, this assumes the dev server is running with
 * authentication disabled or a test user is available.
 *
 * In CI, you would configure test credentials via environment variables.
 */
setup('authenticate', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');

  // Check if we're redirected to login
  const currentUrl = page.url();

  if (currentUrl.includes('/login')) {
    // For E2E tests, we need to handle authentication
    // Option 1: Use test credentials from environment
    // Option 2: Mock the auth state
    // Option 3: Skip auth-required tests in CI without credentials

    console.log('Authentication required - storing empty auth state');
    // Store empty state for now - tests will handle auth checks
    await page.context().storageState({ path: authFile });
  } else {
    // Already authenticated, save state
    await page.context().storageState({ path: authFile });
  }
});
