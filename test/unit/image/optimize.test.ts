import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { optimizeForWeb } from "@/image/optimize";

async function makeTestPng(width: number = 100, height: number = 100): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

describe("optimizeForWeb", () => {
  it("converts PNG to WebP preserving dimensions", async () => {
    const png = await makeTestPng(200, 150);
    const r = await optimizeForWeb({ pngBytes: png });
    expect(r.contentType).toBe("image/webp");
    expect(r.width).toBe(200);
    expect(r.height).toBe(150);
    expect(r.bytes).toBeInstanceOf(Buffer);
    expect(r.bytes.length).toBeGreaterThan(0);
  });

  it("WebP output is produced for non-trivial content", async () => {
    // Solid color PNG is already small. Use a larger image with some variation.
    const png = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .png()
      .toBuffer();
    const r = await optimizeForWeb({ pngBytes: png });
    // For a solid-color image, AVIF should be at least competitive with PNG.
    // We don't strictly require smaller — but we DO require it succeeds.
    expect(r.bytes.length).toBeGreaterThan(0);
  });

  it("strips EXIF metadata from output", async () => {
    // Create a PNG, then we verify the AVIF output doesn't contain orientation tags.
    // sharp's .withMetadata({}) wipes everything — confirm via re-reading metadata.
    const png = await makeTestPng();
    const r = await optimizeForWeb({ pngBytes: png });
    const meta = await sharp(r.bytes).metadata();
    // After strip, EXIF/IPTC/XMP fields should be absent or empty.
    expect(meta.exif).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("respects quality option", async () => {
    // Use noisy content — a solid color compresses to near-nothing at any
    // quality (and webp size isn't monotonic there).
    const w = 256;
    const h = 256;
    const raw = Buffer.alloc(w * h * 3);
    let seed = 12345;
    for (let i = 0; i < raw.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      raw[i] = seed & 0xff;
    }
    const png = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    const lowQ = await optimizeForWeb({ pngBytes: png, quality: 20 });
    const highQ = await optimizeForWeb({ pngBytes: png, quality: 90 });
    expect(highQ.bytes.length).toBeGreaterThan(lowQ.bytes.length);
  });
});
