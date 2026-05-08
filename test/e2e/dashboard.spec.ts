import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should redirect from root to dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display node info on load', async ({ page }) => {
    await page.goto('/dashboard');
    const nodeId = page.locator('[data-testid="node-id"]');
    await expect(nodeId).toBeVisible({ timeout: 5000 });
    await expect(nodeId).toContainText('Node ID:');
  });

  test('should show navigation links', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('text=GNN')).toBeVisible();
    await expect(page.locator('text=Peers')).toBeVisible();
    await expect(page.locator('text=Messages')).toBeVisible();
    await expect(page.locator('text=Publish')).toBeVisible();
  });

  test('should navigate to peers page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('text=Peers');
    await expect(page).toHaveURL('/dashboard/peers');
    await expect(page.locator('h1')).toContainText('Peers');
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.locator('h1')).toContainText('Settings');
    await expect(page.locator('text=API Port')).toBeVisible();
  });

  test('should show publish form', async ({ page }) => {
    await page.goto('/dashboard/publish');
    await expect(page.locator('h1')).toContainText('Publish');
    await expect(page.locator('text=Topic')).toBeVisible();
  });
});
