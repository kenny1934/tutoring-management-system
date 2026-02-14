import { NextRequest, NextResponse } from "next/server";

interface LinkPreviewResult {
  title?: string;
  description?: string;
  image?: string;
  domain: string;
}

// In-memory cache: url -> { data, timestamp }
const cache = new Map<string, { data: LinkPreviewResult; timestamp: number }>();
const CACHE_TTL = 3600_000; // 1 hour in ms

function extractOgTag(html: string, property: string): string | undefined {
  // Match <meta property="og:..." content="..."> or <meta content="..." property="og:...">
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']og:${property}["'][^>]*content=["']([^"']+)["']|<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:${property}["']`,
    "i"
  );
  const match = html.match(regex);
  return match?.[1] || match?.[2] || undefined;
}

function extractMetaDescription(html: string): string | undefined {
  const regex = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']|<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i;
  const match = html.match(regex);
  return match?.[1] || match?.[2] || undefined;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || undefined;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Check cache
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return NextResponse.json({ error: "Could not fetch URL" }, { status: 422 });
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ error: "URL does not return HTML" }, { status: 422 });
    }

    // Read only first 50KB to avoid large payloads
    const reader = resp.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let totalBytes = 0;
      while (totalBytes < 50000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        totalBytes += value.length;
      }
      reader.cancel();
    }

    const title = extractOgTag(html, "title") || extractTitle(html);
    let description = extractOgTag(html, "description") || extractMetaDescription(html);
    let image = extractOgTag(html, "image");

    // Make relative image URLs absolute
    if (image && !image.startsWith("http")) {
      image = image.startsWith("/") ? `${parsed.protocol}//${parsed.host}${image}` : undefined;
    }

    // Truncate long descriptions
    if (description && description.length > 200) {
      description = description.slice(0, 197) + "...";
    }

    const data: LinkPreviewResult = { title, description, image, domain };

    // Cache result
    cache.set(url, { data, timestamp: now });

    // Prune stale entries
    if (cache.size > 500) {
      for (const [key, val] of cache) {
        if (now - val.timestamp > CACHE_TTL) cache.delete(key);
      }
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch URL" }, { status: 422 });
  }
}
