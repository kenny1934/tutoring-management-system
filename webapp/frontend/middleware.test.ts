/**
 * Routing table for the games.* subdomain (and non-interference with the
 * other hosts). Drives the real middleware() with synthetic NextRequests
 * and asserts on the redirect Location / x-middleware-rewrite headers.
 *
 * Regression note: targets must be built as PLAIN URLs, not nextUrl
 * clones — NextURL re-applies the incoming path's trailing-slash state
 * to any pathname set on it, which turned the /zero-blast → /zero-blast/
 * redirect into a self-redirect loop and bolted a slash onto
 * .../index.html. These tests pin the exact emitted paths.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const GAMES = "games.mathconceptsecondary.academy";

function run(host: string, path: string, forwardedHost?: string) {
  const headers: Record<string, string> = { host };
  if (forwardedHost) headers["x-forwarded-host"] = forwardedHost;
  const req = new NextRequest(new URL(path, "https://" + host), { headers });
  const res = middleware(req);
  const rewrite = res.headers.get("x-middleware-rewrite");
  const location = res.headers.get("location");
  return {
    status: res.status,
    rewrite: rewrite ? new URL(rewrite).pathname + new URL(rewrite).search : null,
    redirect: location ? new URL(location).pathname + new URL(location).search : null,
  };
}

describe("games.* subdomain routing", () => {
  it("redirects a bare slug to the trailing-slash form (relative assets must resolve under the game folder)", () => {
    expect(run(GAMES, "/zero-blast")).toEqual({
      status: 308,
      rewrite: null,
      redirect: "/zero-blast/",
    });
  });

  it("keeps the query string through the slash redirect (QR re-scan carries ?room=)", () => {
    expect(run(GAMES, "/zero-blast?room=ABC123&lang=c")).toEqual({
      status: 308,
      rewrite: null,
      redirect: "/zero-blast/?room=ABC123&lang=c",
    });
  });

  it("rewrites a slug directory to the game page", () => {
    expect(run(GAMES, "/zero-blast/")).toEqual({
      status: 200,
      rewrite: "/games/zero-blast/index.html",
      redirect: null,
    });
  });

  it("rewrites the QR join URL keeping ?room=", () => {
    expect(run(GAMES, "/zero-blast/?room=ABC123&lang=c")).toEqual({
      status: 200,
      rewrite: "/games/zero-blast/index.html?room=ABC123&lang=c",
      redirect: null,
    });
  });

  it("rewrites game assets under the game folder", () => {
    expect(run(GAMES, "/zero-blast/levels.js").rewrite).toBe("/games/zero-blast/levels.js");
    expect(run(GAMES, "/zero-blast/audio/zb-sprite.wav").rewrite).toBe(
      "/games/zero-blast/audio/zb-sprite.wav"
    );
    expect(run(GAMES, "/zero-blast/index.html").rewrite).toBe("/games/zero-blast/index.html");
  });

  it("rewrites the shared runtime (../shared/* resolves to /shared/* from a game page)", () => {
    expect(run(GAMES, "/shared/game-bridge.js").rewrite).toBe("/games/shared/game-bridge.js");
    expect(run(GAMES, "/shared/vendor/qrcode.js").rewrite).toBe("/games/shared/vendor/qrcode.js");
    expect(run(GAMES, "/shared/fonts/x.woff2").rewrite).toBe("/games/shared/fonts/x.woff2");
  });

  it("handles underscore slugs (_template)", () => {
    expect(run(GAMES, "/_template").redirect).toBe("/_template/");
    expect(run(GAMES, "/_template/").rewrite).toBe("/games/_template/index.html");
  });

  it("redirects legacy /games/* paths to the clean form", () => {
    expect(run(GAMES, "/games/zero-blast/").redirect).toBe("/zero-blast/");
    expect(run(GAMES, "/games/zero-blast/index.html").redirect).toBe("/zero-blast/index.html");
    expect(run(GAMES, "/games").redirect).toBe("/");
  });

  it("fronts the pilot game at the root (until a games index page exists)", () => {
    expect(run(GAMES, "/")).toEqual({
      status: 308,
      rewrite: null,
      redirect: "/zero-blast/",
    });
  });

  it("passes app internals through untouched", () => {
    expect(run(GAMES, "/logo-secondary.png")).toEqual({
      status: 200,
      rewrite: null,
      redirect: null,
    });
    expect(run(GAMES, "/_next/static/x.js").rewrite).toBeNull();
  });

  it("branches on x-forwarded-host (Cloudflare in front of Cloud Run)", () => {
    expect(run("run-url.a.run.app", "/zero-blast/", GAMES).rewrite).toBe(
      "/games/zero-blast/index.html"
    );
  });
});

describe("other hosts are untouched", () => {
  it("leaves /games/* alone on the main csm host", () => {
    expect(run("csm.mathconceptsecondary.academy", "/games/zero-blast/index.html")).toEqual({
      status: 200,
      rewrite: null,
      redirect: null,
    });
  });

  it("still lands summer.* on the marketing page", () => {
    expect(run("summer.mathconceptsecondary.academy", "/").rewrite).toBe("/summer/landing");
  });
});

describe("trailing-slash strip replication (skipTrailingSlashRedirect)", () => {
  // Next's own strip ran BEFORE middleware and looped against the games
  // slash-adding redirect; the config hands it to us and these pin that
  // every non-games host keeps the exact old behavior.
  it("strips a trailing slash on the main host", () => {
    expect(run("csm.mathconceptsecondary.academy", "/dashboard/")).toEqual({
      status: 308,
      rewrite: null,
      redirect: "/dashboard",
    });
  });

  it("keeps the query while stripping", () => {
    expect(run("csm.mathconceptsecondary.academy", "/dashboard/?tab=2").redirect).toBe(
      "/dashboard?tab=2"
    );
  });

  it("leaves the bare root alone", () => {
    expect(run("csm.mathconceptsecondary.academy", "/")).toEqual({
      status: 200,
      rewrite: null,
      redirect: null,
    });
  });

  it("strips on summer.* too (matches the old Next-level behavior)", () => {
    expect(run("summer.mathconceptsecondary.academy", "/apply/").redirect).toBe("/apply");
  });

  it("does NOT strip game folder URLs on games.*", () => {
    expect(run(GAMES, "/zero-blast/").rewrite).toBe("/games/zero-blast/index.html");
  });
});
