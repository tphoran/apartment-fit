import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MAX_SIZE = 10 * 1024 * 1024;

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function sniffImageFormat(buf: Buffer): { mediaType: SupportedMediaType } | { error: string } {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mediaType: "image/jpeg" };
  }
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mediaType: "image/png" };
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { mediaType: "image/gif" };
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { mediaType: "image/webp" };
  }

  // Detect common unsupported formats for a helpful hint
  let detectedHint = "unknown binary data";
  if (buf.length >= 12) {
    const ftyp = buf.slice(4, 12).toString("ascii");
    if (ftyp.startsWith("ftypavif")) detectedHint = "AVIF";
    else if (ftyp.startsWith("ftypheic") || ftyp.startsWith("ftypmif1") || ftyp.startsWith("ftypmsf1")) detectedHint = "HEIC";
  }

  const isMobileLikely = detectedHint === "HEIC" || detectedHint === "AVIF";
  const explainer = isMobileLikely
    ? ` ${detectedHint} files often come from iPhones, newer Android phones, or websites that auto-serve modern formats — and the file extension can still say .jpg or .jpeg even though the actual image is ${detectedHint}. To convert: open it in Preview (macOS) or Photos and export as PNG or JPEG, or take a screenshot of the image (Cmd+Shift+4 on Mac).`
    : " A file with a .jpg or .jpeg extension isn't always actually a JPEG — re-saving as PNG or JPEG from your image viewer usually fixes this.";

  return {
    error: `This image format isn't supported. Please upload a JPEG, PNG, GIF, or WebP. (Detected: ${detectedHint}.)${explainer}`,
  };
}

type Room = {
  name: string;
  approxWidthFt: number | null;
  approxLengthFt: number | null;
  notes?: string;
};

type ParsedFloorPlan = {
  rooms: Room[];
  totalApproxSqFt: number | null;
  scaleFound: boolean;
  warnings: string[];
};

const SYSTEM_PROMPT = `You are a floor plan analyser. Respond with ONLY a valid JSON object — no markdown fences, no prose. The object must match this TypeScript type exactly:

{
  rooms: Array<{
    name: string;               // lowercase, e.g. "living room", "bedroom 1"
    approxWidthFt: number | null;   // best-guess feet; null if not determinable
    approxLengthFt: number | null;
    notes?: string;             // optional uncertainty notes
  }>;
  totalApproxSqFt: number | null;  // overall area estimate; null if unknown
  scaleFound: boolean;              // true if dimension labels or a scale bar are visible
  warnings: string[];               // always include "no scale visible" when scaleFound is false
}`;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart request." }, { status: 400 });
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File exceeds the 10 MB limit." },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageFormat(buffer);
  if ("error" in sniffed) {
    return NextResponse.json({ error: sniffed.error }, { status: 415 });
  }
  const base64 = buffer.toString("base64");
  const mediaType = sniffed.mediaType;

  const client = new Anthropic();

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: "Parse this floor plan and return the JSON object.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Claude API call failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const raw = message.content[0];
  if (raw.type !== "text") {
    return NextResponse.json(
      { error: "Unexpected response format from Claude." },
      { status: 502 }
    );
  }

  let parsed: ParsedFloorPlan;
  try {
    const text = raw.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Claude returned non-JSON output. Please try again." },
      { status: 422 }
    );
  }

  return NextResponse.json(parsed);
}
