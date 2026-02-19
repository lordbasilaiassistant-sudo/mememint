import { NextRequest, NextResponse } from "next/server";

// Deterministic SVG logo generation - no external APIs needed
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateSVG(name: string, symbol: string): string {
  const hash = hashCode(name + symbol);
  const hue1 = hash % 360;
  const hue2 = (hue1 + 120 + (hash % 60)) % 360;
  const color1 = hslToHex(hue1, 70, 55);
  const color2 = hslToHex(hue2, 65, 45);
  const bgColor = hslToHex(hue1, 20, 12);

  const initials = (symbol || name).slice(0, 3).toUpperCase();

  // Pick a geometric pattern based on hash
  const pattern = hash % 5;
  let shapes = "";

  switch (pattern) {
    case 0: // Circles
      shapes = `
        <circle cx="256" cy="200" r="120" fill="${color1}" opacity="0.3"/>
        <circle cx="256" cy="220" r="90" fill="${color2}" opacity="0.4"/>
      `;
      break;
    case 1: // Diamond
      shapes = `
        <polygon points="256,80 376,230 256,380 136,230" fill="${color1}" opacity="0.3"/>
        <polygon points="256,130 336,230 256,330 176,230" fill="${color2}" opacity="0.4"/>
      `;
      break;
    case 2: // Hexagon
      shapes = `
        <polygon points="256,90 366,155 366,285 256,350 146,285 146,155" fill="${color1}" opacity="0.3"/>
        <polygon points="256,130 336,175 336,265 256,310 176,265 176,175" fill="${color2}" opacity="0.4"/>
      `;
      break;
    case 3: // Stacked bars
      shapes = `
        <rect x="106" y="140" width="300" height="50" rx="25" fill="${color1}" opacity="0.3"/>
        <rect x="136" y="210" width="240" height="50" rx="25" fill="${color2}" opacity="0.4"/>
        <rect x="166" y="280" width="180" height="50" rx="25" fill="${color1}" opacity="0.3"/>
      `;
      break;
    case 4: // Triangle
      shapes = `
        <polygon points="256,80 406,350 106,350" fill="${color1}" opacity="0.3"/>
        <polygon points="256,150 356,330 156,330" fill="${color2}" opacity="0.4"/>
      `;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="${color1}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${bgColor}"/>
      </radialGradient>
    </defs>
    <rect width="512" height="512" rx="64" fill="url(#bg)"/>
    ${shapes}
    <text x="256" y="270" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="96"
      fill="white" letter-spacing="4">${initials}</text>
    <circle cx="256" cy="256" r="200" fill="none" stroke="${color1}" stroke-width="3" opacity="0.2"/>
  </svg>`;
}

export async function POST(req: NextRequest) {
  const { name, symbol } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Token name required" }, { status: 400 });
  }

  const svg = generateSVG(name, symbol || "");
  const base64 = Buffer.from(svg).toString("base64");
  const dataUri = `data:image/svg+xml;base64,${base64}`;

  // Try to upload SVG to catbox.moe for a public URL
  let publicUrl: string | null = null;
  try {
    const catboxForm = new FormData();
    catboxForm.append("reqtype", "fileupload");
    catboxForm.append(
      "fileToUpload",
      new Blob([svg], { type: "image/svg+xml" }),
      `${(symbol || "token").toLowerCase()}_logo.svg`
    );
    const catboxRes = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: catboxForm,
    });
    if (catboxRes.ok) {
      const catboxUrl = await catboxRes.text();
      if (catboxUrl.startsWith("http")) {
        publicUrl = catboxUrl.trim();
      }
    }
  } catch (e) {
    console.error("catbox upload error:", e);
  }

  return NextResponse.json({
    base64: dataUri,
    publicUrl,
  });
}
