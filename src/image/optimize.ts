import sharp from "sharp";

export interface OptimizeInput {
  pngBytes: Buffer;
  quality?: number; // 1-100, default 80
}

export interface OptimizedImage {
  avifBytes: Buffer;
  contentType: "image/avif";
  width: number;
  height: number;
}

export async function optimizeForWeb(input: OptimizeInput): Promise<OptimizedImage> {
  const quality = input.quality ?? 80;
  // sharp strips EXIF/IPTC/XMP by default when withMetadata() is NOT called.
  const pipeline = sharp(input.pngBytes).avif({ quality, effort: 4 }); // effort 4 = balanced; 9 = best (slow)

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    avifBytes: data,
    contentType: "image/avif",
    width: info.width,
    height: info.height,
  };
}
