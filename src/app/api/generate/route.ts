import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";

const rateLimit = new Map<string, { count: number; reset: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const day = 86400000;
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.reset) {
    rateLimit.set(ip, { count: 1, reset: now + day });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again tomorrow!" }, { status: 429 });
  }

  const { idea } = await req.json();
  if (!idea || typeof idea !== "string" || idea.trim().length < 3) {
    return NextResponse.json({ error: "Please provide a token idea (at least 3 characters)" }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "You are a meme token naming expert. Given a concept, generate a creative token name, 3-5 char symbol (letters only, uppercase), catchy description (2 sentences max), tagline (short and punchy), and Twitter bio (under 160 chars). Be creative, funny, and FOMO-inducing. Return ONLY valid JSON with these exact keys: {name, symbol, description, tagline, twitterBio}. No markdown, no code blocks.",
          },
          { role: "user", content: idea.trim().slice(0, 500) },
        ],
        temperature: 0.9,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Groq error:", err);
      return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);

    if (!parsed.name || !parsed.symbol) {
      throw new Error("Invalid response format");
    }

    logActivity(null, 'name_generated', { idea: idea.trim().slice(0, 100), name: parsed.name, symbol: parsed.symbol }, 'mememint');

    return NextResponse.json({
      name: String(parsed.name).slice(0, 50),
      symbol: String(parsed.symbol).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5),
      description: String(parsed.description).slice(0, 300),
      tagline: String(parsed.tagline).slice(0, 100),
      twitterBio: String(parsed.twitterBio).slice(0, 160),
    });
  } catch (e) {
    console.error("Generate error:", e);
    return NextResponse.json({ error: "Failed to generate token. Try again!" }, { status: 500 });
  }
}
