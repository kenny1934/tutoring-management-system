import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('displays login page with Google sign-in button', async ({ page }) => {
    await page.goto('/login');

    // Check page title/branding is visible
    await expect(page.locator('text=Kenny')).toBeVisible({ timeout: 10000 });

    // Check for Google sign-in button
    const googleButton = page.getByRole('button', { name: /sign in with google/i });
    await expect(googleButton).toBeVisible();
  });

  test('shows error message for unauthorized users', async ({ page }) => {
    await page.goto('/login?error=unauthorized');

    // Should display error message
    await expect(
      page.locator('text=not authorised')
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows error message for OAuth failures', async ({ page }) => {
    await page.goto('/login?error=oauth_failed');

    // Should display error message
    await expect(
      page.locator('text=Authentication failed')
    ).toBeVisible({ timeout: 10000 });
  });

  test('login page has proper accessibility attributes', async ({ page }) => {
    await page.goto('/login');

    // Check that the sign-in button is accessible
    const googleButton = page.getByRole('button', { name: /sign in with google/i });
    await expect(googleButton).toBeEnabled();
  });
});

test.describe('Unauthenticated Access', () => {
  test('redirects to login when accessing protected route', async ({ page }) => {
    // Try to access the dashboard without auth
    await page.goto('/');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('redirects to login when accessing students page', async ({ page }) => {
    await page.goto('/students');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('redirects to login when accessing sessions page', async ({ page }) => {
    await page.goto('/sessions');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
