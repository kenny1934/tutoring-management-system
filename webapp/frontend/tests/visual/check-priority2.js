const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ colorScheme: 'dark' });

  await page.goto('http://localhost:3003/design-demo');
  await page.waitForLoadState('networkidle');

  // Wait for page to fully render
  await page.waitForTimeout(2000);

  // Scroll to Engineering Paper section
  const engineeringSection = await page.locator('h2:has-text("Engineering & Technical Paper")');
  if (await engineeringSection.count() > 0) {
    await engineeringSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/visual/screenshots/engineering-paper.png' });
    console.log('✓ Engineering Paper screenshot captured');
  } else {
    console.log('✗ Engineering Paper section not found');
  }

  // Scroll to Certificate section
  const certificateSection = await page.locator('h2:has-text("Certificates & Awards")');
  if (await certificateSection.count() > 0) {
    await certificateSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/visual/screenshots/certificate.png' });
    console.log('✓ Certificate screenshot captured');
  } else {
    console.log('✗ Certificate section not found');
  }

  // Scroll to Composition Notebook section
  const notebookSection = await page.locator('h2:has-text("Composition Notebook")');
  if (await notebookSection.count() > 0) {
    await notebookSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/visual/screenshots/composition-notebook.png' });
    console.log('✓ Composition Notebook screenshot captured');
  } else {
    console.log('✗ Composition Notebook section not found');
  }

  // Scroll to Binder Tabs section
  const binderSection = await page.locator('h2:has-text("Binder Divider Tabs")');
  if (await binderSection.count() > 0) {
    await binderSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/visual/screenshots/binder-tabs.png' });
    console.log('✓ Binder Tabs screenshot captured');
  } else {
    console.log('✗ Binder Tabs section not found');
  }

  await browser.close();
  console.log('\n✓ Priority 2 component validation complete');
})();
