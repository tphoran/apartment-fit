import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

type FurnitureSize = {
  label: string;
  widthIn: number | null;
  depthIn: number | null;
  heightIn: number | null;
};

type ParsedFurniture = {
  name: string;
  category: string;
  sizes: FurnitureSize[];
  defaultSizeIndex: number;
  colorOrFinish?: string;
  material?: string;
  sourceUrl: string;
  warnings: string[];
};

const SYSTEM_PROMPT = `You are a furniture data extractor. You will be given either structured JSON-LD product data or the HTML body of a furniture product page. Extract the data and respond with ONLY the JSON object described below.

CRITICAL: Never invent or infer dimensions. If the provided content does not contain explicit dimension numbers (width, depth, height in inches or cm), set those fields to null and add the warning "Dimensions not visible in page content — verify on the product page". Do NOT use prior knowledge of furniture brands or models to fill in dimensions. Only report numbers that are LITERALLY present in the input text.

Many furniture pages list multiple available sizes (different lengths, modular configurations, etc.). Capture EVERY size variant you can find in the sizes array. If the URL contains a specific variant query param or the page indicates a default selection, use that index for defaultSizeIndex. Do not collapse multiple sizes into one entry. Respond with ONLY a valid JSON object — no markdown fences, no prose.

The object must match this TypeScript type exactly:

type FurnitureSize = {
  label: string;          // e.g. "Standard (63 in)", "Small", "75 in / 191 cm"
  widthIn: number | null;
  depthIn: number | null;
  heightIn: number | null;
};

type ParsedFurniture = {
  name: string;
  category: string;          // "sofa", "bed", "desk", "chair", "table", "shelving", "other"
  sizes: FurnitureSize[];    // ALWAYS at least one entry, even if the page shows only one size
  defaultSizeIndex: number;  // index into sizes[]; the size the URL or page treats as primary, 0 if unclear
  colorOrFinish?: string;
  material?: string;
  sourceUrl: string;         // echo back the input URL
  warnings: string[];        // e.g. "Dimensions not visible in page content — verify on the product page", "Multiple finish options exist", "page required login", "Amazon variants may be incomplete — verify on the product page"
};

For IKEA listings: structured dimension data is usually in the product details section — parse it carefully.
For Amazon listings: add a warning "Amazon variants may be incomplete — verify on the product page" when you cannot see all size/configuration options.

Convert all dimensions to inches yourself — do not call any tools. If a page lists dimensions in cm only, divide by 2.54 and round to one decimal place. Inches values can be approximate; users care about whether furniture fits, not millimeter precision.`;

function isValidHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function isProductJsonLd(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  if (Array.isArray(data)) return data.some(isProductJsonLd);
  const obj = data as Record<string, unknown>;
  const t = obj["@type"];
  return t === "Product" || (Array.isArray(t) && t.includes("Product"));
}

function extractJsonLd(html: string): string | null {
  const results: object[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (isProductJsonLd(parsed)) results.push(parsed);
    } catch {
      // skip malformed blocks
    }
  }
  if (results.length === 0) return null;
  return JSON.stringify(results.length === 1 ? results[0] : results, null, 2).slice(0, 20_000);
}

function extractSpaState(html: string): string | null {
  const chunks: string[] = [];
  let m: RegExpExecArray | null;

  // <script id="__NEXT_DATA__" type="application/json">
  const nextDataRe = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = nextDataRe.exec(html)) !== null) {
    if (m[1].trim()) chunks.push(m[1].trim());
  }

  // window.__APOLLO_STATE__, window.__INITIAL_STATE__, window.__PRELOADED_STATE__
  const windowStateRe = /<script[^>]*>([\s\S]*?window\.(?:__APOLLO_STATE__|__INITIAL_STATE__|__PRELOADED_STATE__)[\s\S]*?)<\/script>/gi;
  while ((m = windowStateRe.exec(html)) !== null) {
    if (m[1].trim()) chunks.push(m[1].trim());
  }

  // <script id="...-data" type="application/json"> (id before type)
  const genericDataRe = /<script[^>]+id=["'][^"']*-data["'][^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = genericDataRe.exec(html)) !== null) {
    if (m[1].trim()) chunks.push(m[1].trim());
  }
  // (type before id)
  const genericDataRe2 = /<script[^>]+type=["']application\/json["'][^>]+id=["'][^"']*-data["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = genericDataRe2.exec(html)) !== null) {
    if (m[1].trim()) chunks.push(m[1].trim());
  }

  if (chunks.length === 0) return null;
  return chunks.join("\n\n").slice(0, 60_000);
}

function cleanHtmlBody(html: string): string {
  let cleaned = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const mainMatch = cleaned.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch) {
    cleaned = mainMatch[0];
  } else {
    const bodyMatch = cleaned.match(/<body[\s\S]*?<\/body>/i);
    if (bodyMatch) cleaned = bodyMatch[0];
  }

  return cleaned.replace(/\s{2,}/g, " ").trim().slice(0, 40_000);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawUrl =
    typeof body === "object" &&
    body !== null &&
    "url" in body &&
    typeof (body as Record<string, unknown>).url === "string"
      ? ((body as Record<string, unknown>).url as string).trim()
      : null;

  if (!rawUrl) {
    return NextResponse.json(
      { error: "Missing or invalid 'url' field. Expected { url: string }." },
      { status: 400 }
    );
  }

  if (!isValidHttpsUrl(rawUrl)) {
    return NextResponse.json(
      {
        error:
          "URL must use HTTPS. http://, file://, javascript:, and other schemes are not accepted.",
      },
      { status: 400 }
    );
  }

  console.log("[parse-furniture] starting", rawUrl);

  // Fetch the page server-side
  let claudeInput: string;
  try {
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 15_000);
    const t0 = Date.now();

    let response: Response;
    try {
      response = await fetch(rawUrl, {
        signal: fetchController.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
    } finally {
      clearTimeout(fetchTimeout);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `The product page returned ${response.status}. Try a different URL.` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const ms = Date.now() - t0;

    const jsonLd = extractJsonLd(html);
    const spaState = jsonLd ? null : extractSpaState(html);
    const tier: "json-ld" | "spa-state" | "html-body" = jsonLd
      ? "json-ld"
      : spaState
      ? "spa-state"
      : "html-body";

    if (tier === "json-ld") {
      claudeInput = `Here is the page's structured product data (Schema.org JSON-LD):\n\n${jsonLd}\n\nThe URL was: ${rawUrl}`;
    } else if (tier === "spa-state") {
      claudeInput = `You will be given the raw initial-state JSON dumps embedded in a Next.js / Apollo / Redux SPA. Find product dimensions, name, sizes, and category by searching this JSON. Dimensions may be in inches, cm, or both — convert to inches. Many fields will be irrelevant — only extract product info.\n\nThe URL was: ${rawUrl}\n\n--- SPA STATE ---\n${spaState}`;
    } else {
      claudeInput = `Extract furniture data from this product page HTML and return ONLY the JSON object described in the system prompt. The page URL was: ${rawUrl}\n\n--- HTML ---\n${cleanHtmlBody(html)}`;
    }
    console.log("[parse-furniture] fetched in", ms, "ms, using:", tier, "input chars:", claudeInput.length);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Could not fetch the URL. The site may block server-side requests or be down." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Could not fetch the URL. The site may block server-side requests or be down." },
      { status: 504 }
    );
  }

  // Call Claude with text only — no tools
  const client = new Anthropic();
  let message: Anthropic.Message;
  try {
    const t0 = Date.now();
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: claudeInput,
        },
      ],
    });
    console.log("[parse-furniture] claude returned in", Date.now() - t0, "ms");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Claude API call failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const textBlock = [...message.content]
    .reverse()
    .find((b): b is Anthropic.TextBlock => b.type === "text");

  if (!textBlock) {
    return NextResponse.json(
      {
        error:
          "No text response from Claude. The page may not have been accessible or may require a login.",
      },
      { status: 422 }
    );
  }

  let parsed: ParsedFurniture;
  try {
    const raw = textBlock.text;

    const fenceStripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    try {
      parsed = JSON.parse(fenceStripped);
    } catch {
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first !== -1 && last > first) {
        parsed = JSON.parse(raw.slice(first, last + 1));
      } else {
        throw new Error("no JSON object found");
      }
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Claude could not extract furniture data from this page. Please confirm the URL points to a furniture product listing.",
      },
      { status: 422 }
    );
  }

  if (!parsed.name || !Array.isArray(parsed.sizes) || parsed.sizes.length === 0) {
    return NextResponse.json(
      { error: "No useful furniture data was found on this page." },
      { status: 422 }
    );
  }

  const hallucinationPhrases = ["infer", "inferred", "training", "known product specifications", "from memory"];
  const hasHallucination = Array.isArray(parsed.warnings) && parsed.warnings.some((w: string) =>
    typeof w === "string" && hallucinationPhrases.some((p) => w.toLowerCase().includes(p))
  );
  if (hasHallucination) {
    return NextResponse.json(
      {
        error: "The page content didn't include explicit dimensions and the model attempted to guess. The site may have rendered dimensions in JavaScript. Try a different URL or retailer.",
        rawWarnings: parsed.warnings,
      },
      { status: 422 }
    );
  }

  console.log("[parse-furniture] ok, sizes:", parsed.sizes.length);
  return NextResponse.json(parsed);
}
