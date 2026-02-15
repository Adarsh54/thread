import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

export const maxDuration = 30;

/**
 * POST /api/preferences/photo
 * Accepts an image file (any format including HEIC), converts to JPEG,
 * uploads to Supabase storage, and returns the public URL.
 */

async function decodeHeic(buffer: Buffer): Promise<Buffer> {
  // Dynamic import — heic-convert is only needed for HEIC files
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const convert = require("heic-convert");
  const result = await convert({
    buffer,
    format: "JPEG",
    quality: 0.9,
  });
  return Buffer.from(result);
}

function isHeic(file: File, buffer: Buffer): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".heic") || name.endsWith(".heif")) return true;
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  // Check magic bytes: "ftyp" at offset 4
  if (buffer.length > 12) {
    const ftyp = buffer.toString("ascii", 4, 8);
    if (ftyp === "ftyp") return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    let buffer = Buffer.from(await file.arrayBuffer());

    // HEIC/HEIF: sharp doesn't have built-in support, use heic-convert first
    if (isHeic(file, buffer)) {
      buffer = await decodeHeic(buffer);
    }

    // Convert to JPEG (handles PNG, WebP, TIFF, and already-converted HEIC)
    const jpegBuffer = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer();

    const path = `${user.id}/photo.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("user-photos")
      .upload(path, jpegBuffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      console.error("[photo] Upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("user-photos")
      .getPublicUrl(path);

    const photoUrl = urlData.publicUrl + `?t=${Date.now()}`;

    return NextResponse.json({ photoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Photo upload failed";
    console.error("[photo]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
