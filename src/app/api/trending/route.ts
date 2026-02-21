import { NextRequest, NextResponse } from "next/server";

// Cache trending tokens server-side (60s TTL)
let cache: { data: any[]; ts: number } = { data: [], ts: 0 };
const CACHE_TTL = 60_000; // 60 seconds

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);

  try {
    const now = Date.now();

    // Refresh cache if stale
    if (now - cache.ts > CACHE_TTL || cache.data.length === 0) {
      const res = await fetch("https://api.dexscreener.com/token-boosts/top/v1", {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      });

      if (!res.ok) {
        // If DexScreener fails but we have cached data, return stale
        if (cache.data.length > 0) {
          return paginatedResponse(cache.data, page, limit, true);
        }
        return NextResponse.json({ tokens: [], total: 0, page, error: "DexScreener API unavailable" });
      }

      const raw = await res.json();
      // Filter to Base chain tokens, deduplicate by address
      const seen = new Set<string>();
      const baseTokens = (Array.isArray(raw) ? raw : []).filter((t: any) => {
        if (t.chainId !== "base" || !t.tokenAddress) return false;
        const addr = t.tokenAddress.toLowerCase();
        if (seen.has(addr)) return false;
        seen.add(addr);
        return true;
      });

      cache = { data: baseTokens, ts: now };
    }

    return paginatedResponse(cache.data, page, limit, false);
  } catch (e) {
    console.error("Trending API error:", e);
    // Return stale cache on error
    if (cache.data.length > 0) {
      return paginatedResponse(cache.data, page, limit, true);
    }
    return NextResponse.json({ tokens: [], total: 0, page, error: "Failed to fetch trending" }, { status: 500 });
  }
}

function paginatedResponse(data: any[], page: number, limit: number, stale: boolean) {
  const total = data.length;
  const totalPages = Math.ceil(total / limit);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const start = (safePage - 1) * limit;
  const tokens = data.slice(start, start + limit);

  return NextResponse.json({
    tokens,
    total,
    page: safePage,
    totalPages,
    ...(stale ? { stale: true } : {}),
  });
}
