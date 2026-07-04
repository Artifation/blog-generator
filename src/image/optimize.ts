import { createRequire } from "node:module";
import type sharpType from "sharp";

// Lazy load: top-level `import sharp from "sharp"` fails at module-load time
// when the native binary for the current platform is missing. Bundlers
// (Next/webpack) ALSO sometimes mangle dynamic `import("sharp")` to point at
// the wrong path. Use Node's native `createRequire` to bypass the bundler
// and use the runtime CWD's module resolution — which is what worked when we
// tested manually inside the container.
let _sharpFactory: typeof sharpType | null = null;
async function getSharp(): Promise<typeof sharpType> {
  if (_sharpFactory) return _sharpFactory;
  // Try dynamic import first (works in most environments).
  try {
    const mod = await import("sharp");
    _sharpFactory = mod.default ?? (mod as unknown as typeof sharpType);
    if (typeof _sharpFactory === "function") return _sharpFactory;
  } catch {
    // fall through to createRequire path
  }
  // Fallback: use Node's native require via createRequire, anchored at the
  // process cwd so the bundler's path-rewriting can't affect resolution.
  const nodeRequire = createRequire(process.cwd() + "/");
  _sharpFactory = nodeRequire("sharp") as typeof sharpType;
  return _sharpFactory;
}

export interface OptimizeInput {
  pngBytes: Buffer;
  quality?: number; // 1-100, default 80
}

export interface OptimizedImage {
  /** AVIF when sharp succeeded; raw input PNG when sharp was unavailable. */
  bytes: Buffer;
  /** "image/avif" when optimised; "image/png" when sharp fallback used. */
  contentType: "image/avif" | "image/png";
  /** Set when sharp could decode; 0 when fallback used (no metadata). */
  width: number;
  height: number;
  /** True when sharp failed and we returned the original PNG unchanged. */
  fallbackUsed: boolean;
}

export async function optimizeForWeb(input: OptimizeInput): Promise<OptimizedImage> {
  const quality = input.quality ?? 80;
  try {
    const sharp = await getSharp();
    // sharp strips EXIF/IPTC/XMP by default when withMetadata() is NOT called.
    const pipeline = sharp(input.pngBytes).avif({ quality, effort: 4 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      contentType: "image/avif",
      width: info.width,
      height: info.height,
      fallbackUsed: false,
    };
  } catch (err) {
    // Sharp can fail at runtime in standalone Next.js bundles where the
    // native binary isn't resolvable from the chunk's path. Falling back to
    // the unoptimized PNG keeps publishing working — file is larger but the
    // post still gets a feature image.
    console.warn(
      "[optimize] sharp unavailable, saving raw PNG without AVIF conversion:",
      (err as Error).message,
    );
    return {
      bytes: input.pngBytes,
      contentType: "image/png",
      width: 0,
      height: 0,
      fallbackUsed: true,
    };
  }
}
