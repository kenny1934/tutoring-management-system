// Take screenshots of real screens on the local dev server, signed in as a
// tutor, so the app can be looked at (or debugged) without going through
// Google. Both local servers have to be running: the frontend on :3000 and
// the backend on :8000.
//
//   node scripts/screens.mjs --as 5 /dashboard /sessions
//   node scripts/screens.mjs --as 5 --widths 390 --themes dark /inbox
//   node scripts/screens.mjs --as 5 --full /students/123
//
// --as        the tutor to sign in as (id, email or part of the name). The
//             token comes from the backend's scripts/dev_signin.py, which only
//             runs against a development backend.
// --widths    viewport widths, comma separated (default 1440,390)
// --themes    light, dark or both (default light,dark)
// --full      also capture what's below the fold. Pages scroll inside the
//             app shell rather than the window, so this lets the shell grow
//             to its full height before the screenshot.
// --out       where to save (default .claude/screens/<time> at the repo root,
//             which git ignores, because the screenshots show real names)
// --base      the frontend's address (default http://localhost:3000)
//
// It only ever reads. Any request to the API that isn't a GET is stopped
// before it leaves the browser and listed at the end, so opening a page that
// saves something on load can't change real data. A screen that needs one of
// those requests to draw itself will look incomplete, and the list says why.

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const backendDir = path.resolve(here, "../../backend");

function parseArgs(argv) {
  const opts = { as: null, widths: [1440, 390], themes: ["light", "dark"], full: false, out: null, base: "http://localhost:3000", routes: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--as") opts.as = next();
    else if (arg === "--widths") opts.widths = next().split(",").map(Number);
    else if (arg === "--themes") opts.themes = next().split(",");
    else if (arg === "--full") opts.full = true;
    else if (arg === "--out") opts.out = next();
    else if (arg === "--base") opts.base = next();
    else if (arg.startsWith("/")) opts.routes.push(arg);
    else throw new Error(`I don't know the option ${arg}`);
  }
  if (!opts.as) throw new Error("Say who to sign in as with --as, for example --as 5");
  if (opts.routes.length === 0) throw new Error("Give at least one page, for example /dashboard");
  return opts;
}

function signIn(who) {
  return execFileSync(path.join(backendDir, "venv/bin/python"), ["scripts/dev_signin.py", who], {
    cwd: backendDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

// "/students/123" becomes "students-123", and "/" becomes "home".
function slug(route) {
  return route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home";
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = signIn(opts.as);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const out = path.resolve(opts.out ?? path.join(repoRoot, ".claude/screens", stamp));
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  const blocked = [];
  try {
    for (const theme of opts.themes) {
      for (const width of opts.widths) {
        const context = await browser.newContext({
          viewport: { width, height: width < 768 ? 844 : 900 },
          colorScheme: theme === "dark" ? "dark" : "light",
        });
        const { hostname } = new URL(opts.base);
        await context.addCookies([{ name: "access_token", value: token, domain: hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
        // next-themes reads its choice from here before the first paint.
        await context.addInitScript((t) => {
          try { localStorage.setItem("theme", t); } catch {}
        }, theme);
        await context.route("**/api/**", (route) => {
          const method = route.request().method();
          if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
          blocked.push(`${method} ${new URL(route.request().url()).pathname}`);
          return route.abort();
        });

        const page = await context.newPage();
        for (const route of opts.routes) {
          await page.goto(opts.base + route, { waitUntil: "networkidle" }).catch(() => {});
          if (new URL(page.url()).pathname.startsWith("/login")) {
            throw new Error(`The app sent ${route} to the login page, so the backend didn't accept the token. If you've just changed JWT_SECRET_KEY, restart the backend.`);
          }
          // Let fonts and the first round of data settle, and hide the Next
          // dev badge, which only exists on the dev server.
          await page.waitForTimeout(800);
          await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
          if (opts.full) {
            await page.addStyleTag({ content: "html,body,#main-content{height:auto!important;overflow:visible!important}" });
            await page.waitForTimeout(200);
          }
          const file = path.join(out, `${slug(route)}-${width}-${theme}.png`);
          await page.screenshot({ path: file, fullPage: opts.full });
          console.log(file);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (blocked.length) {
    console.log(`\nStopped ${blocked.length} request(s) that would have changed data:`);
    for (const line of [...new Set(blocked)]) console.log(`  ${line}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
