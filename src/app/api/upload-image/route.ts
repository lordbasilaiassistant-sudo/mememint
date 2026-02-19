import { NextRequest, NextResponse } from "next/server";

// Max 5MB
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, GIF, WEBP allowed" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const filename = `token_${Date.now()}.${ext}`;

    // Try imgbb first (if key available)
    const imgbbKey = process.env.IMGBB_API_KEY;
    if (imgbbKey) {
      try {
        const form = new URLSearchParams();
        form.append("key", imgbbKey);
        form.append("image", base64);
        form.append("name", filename);
        const res = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          const url = data.data?.url || data.data?.display_url;
          if (url) {
            return NextResponse.json({
              publicUrl: url,
              base64: `data:${file.type};base64,${base64}`,
            });
          }
        }
      } catch (e) {
        console.error("imgbb upload error:", e);
      }
    }

    // Fallback: catbox.moe (anonymous, no key)
    try {
      const catboxForm = new FormData();
      catboxForm.append("reqtype", "fileupload");
      catboxForm.append("fileToUpload", new Blob([buffer], { type: file.type }), filename);
      const res = await fetch("https://catbox.moe/user/api.php", {
        method: "POST",
        body: catboxForm,
      });
      if (res.ok) {
        const url = (await res.text()).trim();
        if (url.startsWith("http")) {
          return NextResponse.json({
            publicUrl: url,
            base64: `data:${file.type};base64,${base64}`,
          });
        }
      }
    } catch (e) {
      console.error("catbox upload error:", e);
    }

    // Last resort: return base64 only (deploy won't have public URL but preview works)
    return NextResponse.json({
      publicUrl: null,
      base64: `data:${file.type};base64,${base64}`,
      warning: "Could not upload to CDN — image preview only. Deploy may use placeholder.",
    });
  } catch (e) {
    console.error("Upload error:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
