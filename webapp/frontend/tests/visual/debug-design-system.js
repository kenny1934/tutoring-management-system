/**
 * Design System Visual Debugging Script
 *
 * Uses Playwright to capture screenshots and verify computed styles
 * of classroom skeuomorphism components.
 *
 * Run with: node tests/visual/debug-design-system.js
 */

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Define screenshot directory
  const screenshotDir = path.join(__dirname, 'screenshots');

  // Navigate to the design demo page
  await page.goto('http://localhost:3000/design-demo');

  // Wait for the page to load
  await page.waitForLoadState('networkidle');

  // Take full page screenshot
  await page.screenshot({
    path: path.join(screenshotDir, 'full-page.png'),
    fullPage: true
  });
  console.log('✓ Full page screenshot saved');

  // Screenshot the graph paper section
  const graphPaperSection = await page.locator('section:has-text("Graph Paper")').first();
  if (await graphPaperSection.count() > 0) {
    await graphPaperSection.screenshot({
      path: path.join(screenshotDir, 'graph-paper.png')
    });
    console.log('✓ Graph paper section screenshot saved');
  }

  // Screenshot the report card section
  const reportCardSection = await page.locator('section:has-text("Report Card")').first();
  if (await reportCardSection.count() > 0) {
    await reportCardSection.screenshot({
      path: path.join(screenshotDir, 'report-card.png')
    });
    console.log('✓ Report card section screenshot saved');
  }

  // Get computed styles for debugging
  const graphPaperElement = await page.locator('.graph-paper-1cm').first();
  if (await graphPaperElement.count() > 0) {
    const bgImage = await graphPaperElement.evaluate(el =>
      window.getComputedStyle(el).backgroundImage
    );
    const bgColor = await graphPaperElement.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );
    console.log('\nGraph Paper (1cm) Computed Styles:');
    console.log('  backgroundImage:', bgImage.substring(0, 100) + '...');
    console.log('  backgroundColor:', bgColor);
  }

  // Get report card subject layout info
  const subjectElement = await page.locator('.grid.grid-cols-\\[1fr_auto\\]').first();
  if (await subjectElement.count() > 0) {
    const width = await subjectElement.evaluate(el => el.offsetWidth);
    const classes = await subjectElement.evaluate(el => el.className);
    console.log('\nReport Card Subject Layout:');
    console.log('  Width:', width + 'px');
    console.log('  Classes:', classes);
  }

  await browser.close();
  console.log('\n✓ Visual debugging complete');
})();
