/**
 * Comprehensive Design System Visual Test
 *
 * Captures screenshots of ALL components in both light and dark modes
 * to systematically identify dark mode issues.
 *
 * Run with: node tests/visual/check-all-components.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Component sections to test
const COMPONENT_SECTIONS = [
  { name: 'Sticky Notes', selector: 'h2:has-text("Sticky Notes")' },
  { name: 'Flash Cards', selector: 'h2:has-text("Flash Cards")' },
  { name: 'Paper Texture', selector: 'h2:has-text("Paper Texture Utilities")' },
  { name: 'Torn Paper Edges', selector: 'h2:has-text("Torn Paper Edges")' },
  { name: 'Ruled Lines', selector: 'h2:has-text("Ruled Lines & Margins")' },
  { name: 'Graph Paper', selector: 'h2:has-text("Graph Paper")' },
  { name: 'Engineering Paper', selector: 'h2:has-text("Engineering & Technical Paper")' },
  { name: 'Highlighter', selector: 'h2:has-text("Highlighter Marks")' },
  { name: 'Rubber Stamps', selector: 'h2:has-text("Rubber Stamps")' },
  { name: 'Worksheet Card', selector: 'h2:has-text("Worksheet Card")' },
  { name: 'Report Card', selector: 'h2:has-text("Report Card")' },
  { name: 'File Folder', selector: 'h2:has-text("File Folder Tabs")' },
  { name: 'Calculator', selector: 'h2:has-text("Calculator Displays")' },
  { name: 'Sticker Badges', selector: 'h2:has-text("Sticker Badges")' },
  { name: 'Handwritten Notes', selector: 'h2:has-text("Handwritten Annotations")' },
  { name: 'Certificate', selector: 'h2:has-text("Certificates & Awards")' },
  { name: 'Composition Notebook', selector: 'h2:has-text("Composition Notebook")' },
  { name: 'Binder Tabs', selector: 'h2:has-text("Binder Divider Tabs")' },
];

async function captureComponents(colorScheme, port = 3003) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ colorScheme });

  console.log(`\n=== Capturing ${colorScheme.toUpperCase()} mode screenshots ===\n`);

  try {
    await page.goto(`http://localhost:${port}/design-demo`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Let animations settle

    const screenshotDir = path.join(__dirname, 'screenshots', colorScheme);

    // Ensure directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    let captured = 0;
    let missing = 0;

    for (const section of COMPONENT_SECTIONS) {
      const element = await page.locator(section.selector);
      const count = await element.count();

      if (count > 0) {
        // Scroll to section
        await element.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // Capture screenshot of the section
        const filename = section.name.toLowerCase().replace(/\s+/g, '-') + '.png';
        await page.screenshot({
          path: path.join(screenshotDir, filename),
          fullPage: false
        });

        console.log(`✓ ${section.name}`);
        captured++;
      } else {
        console.log(`✗ ${section.name} - NOT FOUND`);
        missing++;
      }
    }

    console.log(`\n${colorScheme.toUpperCase()}: ${captured} captured, ${missing} missing`);

  } catch (error) {
    console.error(`Error in ${colorScheme} mode:`, error.message);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Comprehensive Design System Visual Test             ║');
  console.log('║  Capturing ALL components in light and dark modes     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  // Capture both light and dark modes
  await captureComponents('light');
  await captureComponents('dark');

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  ✓ Visual testing complete!                           ║');
  console.log('║                                                       ║');
  console.log('║  Screenshots saved to:                                ║');
  console.log('║  • tests/visual/screenshots/light/                    ║');
  console.log('║  • tests/visual/screenshots/dark/                     ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
