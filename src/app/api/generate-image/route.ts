import { NextRequest, NextResponse } from "next/server";

const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell";

export async function POST(req: NextRequest) {
  if (!HF_TOKEN) {
    return NextResponse.json({ error: "Image generation not configured" }, { status: 500 });
  }

  const { name, symbol, description } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Token name required" }, { status: 400 });
  }

  const prompt = `A clean, vibrant meme token logo for a cryptocurrency called "${name}" ($${symbol || "TOKEN"}). ${description || ""}. Circular coin design, bold colors, playful cartoon style, crypto meme aesthetic, centered composition, flat design, no text, no letters, no words, solid color background, high quality icon, mascot character`;

  try {
    const hfRes = await fetch(HF_MODEL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          num_inference_steps: 4,
          width: 512,
          height: 512,
        },
      }),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error("HuggingFace error:", hfRes.status, errText);
      if (hfRes.status === 503) {
        return NextResponse.json(
          { error: "Image model is warming up. Please try again in ~20 seconds.", loading: true },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Image generation failed" }, { status: 502 });
    }

    const imageBuffer = Buffer.from(await hfRes.arrayBuffer());
    const base64 = imageBuffer.toString("base64");

    // Upload to imgbb for a permanent public URL (free, no account needed for anon uploads)
    let publicUrl: string | null = null;
    try {
      const imgbbKey = process.env.IMGBB_API_KEY;
      if (imgbbKey) {
        const formData = new URLSearchParams();
        formData.append("key", imgbbKey);
        formData.append("image", base64);
        formData.append("name", `${symbol || "token"}_logo`);

        const uploadRes = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          publicUrl = uploadData.data?.url || uploadData.data?.display_url || null;
        }
      }
    } catch (e) {
      console.error("imgbb upload error:", e);
    }

    // Fallback: use catbox.moe (anonymous, no key needed)
    if (!publicUrl) {
      try {
        const catboxForm = new FormData();
        catboxForm.append("reqtype", "fileupload");
        catboxForm.append("fileToUpload", new Blob([imageBuffer], { type: "image/png" }), `${symbol || "token"}.png`);
        
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
    }

    return NextResponse.json({
      base64: `data:image/png;base64,${base64}`,
      publicUrl,
    });
  } catch (e) {
    console.error("Image generation error:", e);
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
  }
}
