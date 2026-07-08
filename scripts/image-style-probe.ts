/**
 * Image-style probe — iterate blog-header prompts against Flux CHEAPLY, outside
 * the full pipeline, to land a calm/realistic (non-futuristic) look.
 *
 * Production generates post images via Fal/Flux Pro (fal-ai/flux-pro/v1.1-ultra),
 * so this probe uses the SAME model. It reads FAL_API_KEY from apps/web/.env (or
 * the environment) WITHOUT printing it, renders every variant once, and saves
 * PNGs to OUT_DIR for visual review.
 *
 * Run:  npx tsx scripts/image-style-probe.ts
 * Cost: ~€0.02–0.05 per image.
 */
import { fal } from "@fal-ai/client";
import fs from "node:fs";
import path from "node:path";
import { composeBrandedPrompt } from "../src/image/fal.ts";

const OUT_DIR =
  process.env.PROBE_OUT_DIR ||
  path.resolve(process.cwd(), "scripts/.probe-out");

/** Read FAL_API_KEY from apps/web/.env without echoing its value. */
function loadFalKey(): string {
  if (process.env.FAL_API_KEY) return process.env.FAL_API_KEY;
  const envPath = path.resolve(process.cwd(), "apps/web/.env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*FAL_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(
    "No FAL_API_KEY found. Add `FAL_API_KEY=…` to apps/web/.env or the environment.",
  );
}

// ── Candidate NEW strategy ──────────────────────────────────────────────────
// Realism-first, POSITIVE constraints. Flux respects declarative "there is a …"
// far better than a trailing "Avoid: …" list (which it largely ignores).
const PREFIX_NEW =
  "A real, candid documentary photograph shot by a professional photographer on a full-frame DSLR with a 35mm lens. " +
  "An ordinary, calm Dutch small-business workplace on a normal working day. Soft natural daylight from a window. " +
  "Muted, natural, true-to-life colours. Real materials and textures. Understated, relaxed composition, shallow depth of field. " +
  "It looks like a genuine everyday photo. Every screen is switched off or shows only plain simple text; " +
  "there are no charts, dashboards, glowing graphics, holograms, neon light, blue digital glow or digital overlays of any kind; nothing futuristic or sci-fi.";

const PREFIX_FILM =
  "Photograph on Kodak Portra 400 film, natural window light, ordinary Dutch office, calm and understated, muted natural colours, " +
  "real everyday scene, shallow depth of field, no digital effects, screens off or plain, nothing futuristic.";

interface Variant {
  id: string;
  prompt: string;
}

// Two representative topics. For each: a BASELINE (exactly what prod composes
// today, via composeBrandedPrompt) vs improved strategies, so we see the delta.
const VARIANTS: Variant[] = [
  // ── Finance (the exact case that produced the sci-fi image) ──
  {
    id: "finance-BASELINE-prod",
    // Mirrors a plausible imagePrompter subject + prod's composeBrandedPrompt.
    prompt: composeBrandedPrompt(
      "A financial analyst reviewing budgets and forecasts on a laptop in a modern office.",
      "",
    ),
  },
  {
    id: "finance-new-paper",
    prompt: `${PREFIX_NEW} Subject: a printed financial report and a calculator on a tidy wooden desk, a person's hands writing notes with a pen, a cup of coffee beside them.`,
  },
  {
    id: "finance-new-laptopblank",
    prompt: `${PREFIX_NEW} Subject: a person working at a plain laptop on a tidy office desk; the laptop screen shows a simple plain black-on-white spreadsheet; printed papers and a coffee cup next to it.`,
  },
  {
    id: "finance-film-paper",
    prompt: `${PREFIX_FILM} Subject: a printed financial report, a calculator and reading glasses on a wooden desk, warm morning light.`,
  },
  // ── Manufacturing (the original complaint image was a sci-fi factory) ──
  {
    id: "maakindustrie-BASELINE-prod",
    prompt: composeBrandedPrompt(
      "AI in manufacturing: a smart factory with connected machines and data dashboards.",
      "",
    ),
  },
  {
    id: "maakindustrie-new-workshop",
    prompt: `${PREFIX_NEW} Subject: a machine operator in overalls checking a part at a workbench in a small Dutch metal workshop, tools and steel components on the bench.`,
  },
];

async function main() {
  fal.config({ credentials: loadFalKey() });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`Rendering ${VARIANTS.length} probe images to ${OUT_DIR}`);

  for (const v of VARIANTS) {
    try {
      const result = (await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
        input: {
          prompt: v.prompt,
          num_images: 1,
          safety_tolerance: "2",
          output_format: "png",
          aspect_ratio: "16:9",
        },
      })) as { data: { images: { url: string }[] } };
      const url = result.data.images[0]?.url;
      if (!url) throw new Error("no image url");
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = path.join(OUT_DIR, `${v.id}.png`);
      fs.writeFileSync(file, buf);
      // eslint-disable-next-line no-console
      console.log(`OK   ${v.id}  -> ${file}  (${Math.round(buf.length / 1024)} KB)`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`FAIL ${v.id}: ${(err as Error).message}`);
    }
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
