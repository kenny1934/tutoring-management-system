// Renders the PNG icons that scripts/logo/build.py lists in icons.json, in a
// real browser, so each size is drawn from the SVG the way a browser draws it.
// Run it from webapp/frontend, after build.py.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const jobs = JSON.parse(readFileSync("scripts/logo/icons.json", "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const { svg, size, out } of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const markup = readFileSync(svg, "utf8").replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${markup}</body>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`${out} (${size}px)`);
}
await browser.close();
