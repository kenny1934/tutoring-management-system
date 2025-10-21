const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

/**
 * Visual Test for Session Detail Page Enhancements
 *
 * Tests all 5 major enhancements in both light and dark modes:
 * 1. WorksheetCard components (Classwork + Homework)
 * 2. IndexCard grid (homework completion)
 * 3. GradeStamp (performance rating)
 * 4. FileFolder component (Session + People tabs)
 * 5. Certificate component (future features)
 */

async function captureSessionDetailScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const baseUrl = 'http://localhost:3000';

  // Create output directories
  const screenshotDir = path.join(__dirname, 'screenshots', 'session-detail');
  const lightDir = path.join(screenshotDir, 'light');
  const darkDir = path.join(screenshotDir, 'dark');

  [lightDir, darkDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  console.log('🎬 Starting Session Detail Page Visual Tests...\n');

  // Test in both light and dark modes
  for (const mode of ['light', 'dark']) {
    console.log(`\n📸 Capturing ${mode} mode screenshots...`);

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      colorScheme: mode,
    });

    const page = await context.newPage();
    const outputDir = mode === 'light' ? lightDir : darkDir;

    try {
      // Navigate to session detail page (using session ID with complete data)
      const sessionUrl = `${baseUrl}/sessions/2569`;

      console.log(`  ⏳ Loading ${sessionUrl}...`);
      await page.goto(sessionUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for animations to complete
      await page.waitForTimeout(2000);

      // 1. Full page screenshot
      console.log('  📷 Full page overview');
      await page.screenshot({
        path: path.join(outputDir, '01-full-page.png'),
        fullPage: true,
      });

      // 2. LED Header
      console.log('  📷 LED Marquee Header');
      const header = await page.locator('.flex.items-center.gap-4').first();
      if (await header.count() > 0) {
        await header.screenshot({
          path: path.join(outputDir, '02-led-header.png'),
        });
      }

      // 3. FileFolder component - Session tab
      console.log('  📷 FileFolder - Session tab');
      const fileFolder = await page.locator('div').filter({ hasText: /^SessionPeople/ });
      if (await fileFolder.count() > 0) {
        await fileFolder.screenshot({
          path: path.join(outputDir, '03-file-folder-session.png'),
        });
      }

      // 4. FileFolder component - People tab (click to switch)
      console.log('  📷 FileFolder - People tab');
      const peopleTab = await page.locator('button').filter({ hasText: 'People' });
      if (await peopleTab.count() > 0) {
        await peopleTab.click();
        await page.waitForTimeout(500);

        if (await fileFolder.count() > 0) {
          await fileFolder.screenshot({
            path: path.join(outputDir, '04-file-folder-people.png'),
          });
        }
      }

      // 5. Spiral Notebook with Performance Rating
      console.log('  📷 Spiral Notebook + GradeStamp');
      const notebook = await page.locator('div').filter({ hasText: /Session Notes|Performance Rating/ }).filter({ has: page.locator('.paper-texture') });
      if (await notebook.count() > 0) {
        await notebook.first().screenshot({
          path: path.join(outputDir, '05-notebook-grade-stamp.png'),
        });
      }

      // 6. WorksheetCard components (Classwork + Homework)
      console.log('  📷 WorksheetCard components');
      const worksheets = await page.locator('div').filter({ hasText: /^Classwork|^Homework/ }).filter({ has: page.locator('.paper-texture') });
      if (await worksheets.count() > 0) {
        await worksheets.first().screenshot({
          path: path.join(outputDir, '06-worksheets.png'),
        });
      }

      // 7. IndexCard grid (homework completion)
      console.log('  📷 IndexCard grid');
      const homeworkSection = await page.locator('div').filter({ hasText: 'Homework Completion' });
      if (await homeworkSection.count() > 0) {
        await homeworkSection.screenshot({
          path: path.join(outputDir, '07-homework-index-cards.png'),
        });
      }

      // 8. Certificate component
      console.log('  📷 Certificate component');
      const certificate = await page.locator('div').filter({ hasText: 'Future Enhancements' }).filter({ has: page.locator('.border-double') });
      if (await certificate.count() > 0) {
        await certificate.screenshot({
          path: path.join(outputDir, '08-certificate.png'),
        });
      }

      // 9. Viewport at tablet size
      console.log('  📷 Tablet viewport (768px)');
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(outputDir, '09-tablet-view.png'),
        fullPage: true,
      });

      // 10. Viewport at mobile size
      console.log('  📷 Mobile viewport (375px)');
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(outputDir, '10-mobile-view.png'),
        fullPage: true,
      });

      console.log(`  ✅ ${mode} mode screenshots complete`);

    } catch (error) {
      console.error(`  ❌ Error capturing ${mode} mode screenshots:`, error.message);
    } finally {
      await context.close();
    }
  }

  await browser.close();

  console.log('\n✨ Session Detail Page Visual Tests Complete!');
  console.log(`📁 Screenshots saved to: ${screenshotDir}`);
  console.log('\nScreenshot Summary:');
  console.log('  - Full page overview (light + dark)');
  console.log('  - LED Marquee Header');
  console.log('  - FileFolder component (Session + People tabs)');
  console.log('  - Spiral Notebook with GradeStamp');
  console.log('  - WorksheetCard components');
  console.log('  - IndexCard grid');
  console.log('  - Certificate component');
  console.log('  - Responsive views (tablet + mobile)');
  console.log('\n🔍 Please review screenshots for:');
  console.log('  ✓ Dark mode styling correctness');
  console.log('  ✓ Paper textures visibility');
  console.log('  ✓ Component alignment and spacing');
  console.log('  ✓ Text contrast and readability');
  console.log('  ✓ Responsive layout behavior');
}

// Run the tests
captureSessionDetailScreenshots().catch(console.error);
