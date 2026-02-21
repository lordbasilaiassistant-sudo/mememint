import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";

const BANKR_API_KEY = process.env.BANKR_API_KEY;
const BANKR_API_URL = "https://api.bankr.bot";

// Rate limit: 5 deploys per IP per day
const deployLimit = new Map<string, { count: number; reset: number }>();

function checkDeployLimit(ip: string): boolean {
  const now = Date.now();
  const day = 86400000;
  const entry = deployLimit.get(ip);
  if (!entry || now > entry.reset) {
    deployLimit.set(ip, { count: 1, reset: now + day });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// POST /api/deploy — Submit deploy job, return jobId for client polling
export async function POST(req: NextRequest) {
  if (!BANKR_API_KEY) {
    return NextResponse.json({ error: "Server not configured for deployment" }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkDeployLimit(ip)) {
    return NextResponse.json({ error: "Deploy limit reached (5/day). Come back tomorrow!" }, { status: 429 });
  }

  const {
    name,
    symbol,
    description,
    imageUrl,
    walletAddress,
    website,   // optional: project website URL
    tweet,     // optional: associated tweet URL for social proof
    twitter,   // optional: @handle for fee routing via X
  } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "Token name required (2+ chars)" }, { status: 400 });
  }

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: "Valid wallet address required (0x...)" }, { status: 400 });
  }

  // Use uploaded image URL if available — skip image param entirely if none provided
  // (Bankr will use a default if no image specified, better than a random placeholder)
  const image = imageUrl || null;
  const desc = description || `${name} — deployed on Base via MemeMint`;
  const siteUrl = website?.trim() || "https://thryx.mom";

  // Build prompt with all available Bankr params embedded as natural language
  // Bankr parses: name, symbol, image, website, tweet, fee recipient, fee-type
  const parts = [
    `Deploy a token on Base called ${name.trim()}`,
    symbol ? `with symbol ${symbol.trim()}` : "",
    image ? `with image ${image}` : "",
    `with website ${siteUrl}`,
    tweet?.trim() ? `with tweet ${tweet.trim()}` : "",
    desc ? `Description: ${desc.slice(0, 200)}` : "",
    // Fee routing: prefer twitter handle if provided, else wallet address
    twitter?.trim()
      ? `Set fee recipient to ${twitter.trim()} via X`
      : `Set fee recipient to ${walletAddress}`,
  ].filter(Boolean).join(". ") + ".";

  console.log("Bankr deploy prompt:", parts);

  try {
    const submitRes = await fetch(`${BANKR_API_URL}/agent/prompt`, {
      method: "POST",
      headers: {
        "X-API-Key": BANKR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: parts }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      console.error("Bankr submit error:", submitRes.status, err);
      return NextResponse.json({ error: "Failed to submit deploy request" }, { status: 502 });
    }

    const submitData = await submitRes.json();
    const jobId = submitData.jobId || submitData.id;

    if (!jobId) {
      console.error("No jobId in Bankr response:", submitData);
      return NextResponse.json({ error: "Invalid deploy response" }, { status: 502 });
    }

    return NextResponse.json({
      submitted: true,
      jobId,
      name: name.trim(),
      symbol: symbol?.trim(),
      walletAddress,
    });
  } catch (e) {
    console.error("Deploy error:", e);
    const msg = e instanceof Error ? e.message : "Deploy failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
