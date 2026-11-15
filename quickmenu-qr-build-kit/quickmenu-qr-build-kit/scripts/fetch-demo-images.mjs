/**
 * Downloads the demo photos for the seeded Cafe Aroma menu.
 *
 * Why this exists: the image-generation service is not available here, and the
 * Cloudinary URLs in the seed are placeholders, so the demo menu would show
 * empty tiles. Each photo is the lead image of a Wikipedia article, stored on
 * Wikimedia Commons; the original is cropped to a square and every file is
 * recorded in ATTRIBUTION.md with author, licence and source.
 *
 * Thumbnail URLs on this network return 400, so originals are downloaded and
 * cropped locally with System.Drawing.
 *
 * Usage: node scripts/fetch-demo-images.mjs
 */
import { execFileSync } from "child_process";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const OUT_DIR = path.resolve("apps/web/public/demo");
const ATTRIBUTION = path.resolve("apps/web/public/demo/ATTRIBUTION.md");
const TMP_DIR = path.join(os.tmpdir(), "quickmenu-demo");
const SUMMARY_API = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const META_API = "https://en.wikipedia.org/w/api.php";
const UA =
  "QuickMenuQR-Demo/1.0 (local development demo asset download; contact dev@example.invalid)";
const SIZE = 1000;
const DELAY_MS = 1500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** slug -> Wikipedia articles to try, in order, with words that disqualify a file. */
const DISHES = {
  "spring-rolls": { titles: ["Spring roll"] },
  "chicken-wings": { titles: ["Buffalo wing"] },
  "loaded-fries": { titles: ["Cheese fries"] },
  "chicken-biryani": { titles: ["Biryani"] },
  "beef-karahi": { titles: ["Chicken karahi", "Karahi", "Nihari"], avoid: ["wok", "karahi-2", "pan"] },
  "margherita-pizza": { titles: ["Margherita pizza", "Neapolitan pizza", "Pizza"] },
  "chicken-burger": { titles: ["Chicken burger", "Hamburger", "Cheeseburger"], avoid: ["salad", "sandwich"] },
  "mint-lemonade": { titles: ["Limonana", "Mint lemonade", "Lemonade"] },
  cappuccino: { titles: ["Cappuccino"] },
  // Article lead images for "Mango lassi" are salted lassi, so this one is a
  // named Commons file found with the file-namespace search.
  "mango-lassi": { file: "Mango Lassi.jpg", title: "Mango lassi" },
  "chocolate-brownie": { titles: ["Chocolate brownie"] },
  kulfi: { titles: ["Kulfi"] },
};

const BAD_WORDS = ["map", "logo", "diagram", "chart", "sign", "poster", "cover", ".svg"];

function curl(args) {
  return execFileSync("curl.exe", ["-s", "-L", "--max-time", "120", "-A", UA, ...args], {
    maxBuffer: 128 * 1024 * 1024,
  });
}

/** Retries while Wikipedia throttles the shared IP. */
async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await wait(DELAY_MS * (attempt + 1));
    let raw;
    try {
      raw = curl([url]).toString("utf8");
    } catch (error) {
      if (attempt === 4) throw error;
      continue;
    }
    if (raw.trimStart().startsWith("{")) return JSON.parse(raw);
    if (!/too many requests|rate limit/i.test(raw) && attempt === 4) {
      throw new Error(raw.slice(0, 120));
    }
  }
  throw new Error("rate limited by the Wikipedia API");
}

function stripQuery(url) {
  return url.split("?")[0];
}

/** Crops the centre square out of a photo and writes a 1000x1000 JPEG. */
function squareCrop(input, output) {
  const script = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile(${JSON.stringify(input)})
$side = [Math]::Min($src.Width, $src.Height)
$x = [int](($src.Width - $side) / 2)
$y = [int](($src.Height - $side) / 2)
$bitmap = New-Object System.Drawing.Bitmap ${SIZE}, ${SIZE}
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$dest = New-Object System.Drawing.Rectangle 0, 0, ${SIZE}, ${SIZE}
$crop = New-Object System.Drawing.Rectangle $x, $y, $side, $side
$graphics.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoder = New-Object System.Drawing.Imaging.EncoderParameters 1
$encoder.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, 84)
$bitmap.Save(${JSON.stringify(output)}, $codec, $encoder)
$graphics.Dispose()
$bitmap.Dispose()
$src.Dispose()
`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    stdio: "pipe",
  });
}

/** Resolves a named Commons file (used when the article lead image is wrong). */
async function leadFromFile(fileTitle, title) {
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    titles: `File:${fileTitle}`,
    prop: "imageinfo",
    iiprop: "url",
  });
  const data = await getJson(`${META_API}?${query.toString()}`);
  const page = Object.values(data.query?.pages ?? {})[0];
  const url = page?.imageinfo?.[0]?.url;
  if (!url) return null;
  return { url: stripQuery(url), fileTitle, title };
}

async function findLeadImage(titles, avoid = []) {
  for (const title of titles) {
    try {
      const data = await getJson(`${SUMMARY_API}${encodeURIComponent(title.replace(/ /g, "_"))}`);
      const source = data.originalimage?.source ?? data.thumbnail?.source;
      if (!source) continue;
      const name = decodeURIComponent(stripQuery(source).split("/").pop() ?? "");
      const lowered = name.toLowerCase().replace(/[_%22]/g, " ");
      if (BAD_WORDS.some((word) => lowered.includes(word))) continue;
      if (avoid.some((word) => lowered.includes(word))) {
        console.warn(`  skipping "${name}" for "${title}" (avoid: ${avoid.join(", ")})`);
        continue;
      }
      if (!/\.(jpe?g|png)$/i.test(name)) continue;
      // Thumbnail URLs are prefixed with the width ("3840px-Name.jpg"); the
      // Commons file title never is.
      const fileTitle = name.replace(/_/g, " ").replace(/^\d+px-/, "");
      return { url: stripQuery(source), fileTitle, title };
    } catch (error) {
      console.warn(`  lookup failed for "${title}": ${error.message}`);
    }
  }
  return null;
}

/**
 * Credits are fetched after the downloads so a throttled lookup cannot cost us
 * a photo; the metadata endpoint is also given a longer backoff than the rest.
 */
async function attribution(fileTitle) {
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    titles: `File:${fileTitle}`,
    prop: "imageinfo",
    iiprop: "extmetadata|url",
  });
  const clean = (value, fallback) =>
    (value ?? fallback)
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .replace(/\|/g, "/")
      .trim();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(2000 + attempt * 3000);
    try {
      const raw = curl([`${META_API}?${query.toString()}`]).toString("utf8");
      if (!raw.trimStart().startsWith("{")) continue;
      const page = Object.values(JSON.parse(raw).query?.pages ?? {})[0];
      const info = page?.imageinfo?.[0];
      if (!info?.extmetadata?.LicenseShortName?.value) continue;
      return {
        author: clean(info.extmetadata.Artist?.value, "Unknown author"),
        license: clean(info.extmetadata.LicenseShortName.value, "See source"),
        sourceUrl: info.descriptionurl ?? "",
      };
    } catch {
      /* Retry below. */
    }
  }
  console.warn(`  attribution failed for ${fileTitle}`);
  return { author: "Unknown author", license: "See source", sourceUrl: "" };
}

await mkdir(OUT_DIR, { recursive: true });
await mkdir(TMP_DIR, { recursive: true });
const downloads = [];

for (const [slug, spec] of Object.entries(DISHES)) {
  console.log(`\n${slug}`);
  const lead = spec.file
    ? await leadFromFile(spec.file, spec.title ?? spec.file)
    : await findLeadImage(spec.titles, spec.avoid);
  if (!lead) {
    console.warn(`  no usable lead image`);
    continue;
  }

  const rawPath = path.join(TMP_DIR, `${slug}-raw.jpg`);
  const outPath = path.join(OUT_DIR, `${slug}.jpg`);
  try {
    const status = curl(["-o", rawPath, lead.url, "-w", "%{http_code}"]).toString("utf8").trim();
    if (status !== "200") throw new Error(`download ${status}`);
    squareCrop(rawPath, outPath);
    downloads.push({ slug, lead });
    console.log(`  -> ${slug}.jpg · ${lead.title}`);
  } catch (error) {
    console.warn(`  download failed: ${error.message}`);
  } finally {
    await rm(rawPath, { force: true });
  }
}

const rows = [];
for (const entry of downloads) {
  const meta = await attribution(entry.lead.fileTitle);
  const { size } = await stat(path.join(OUT_DIR, `${entry.slug}.jpg`));
  rows.push({ slug: entry.slug, file: `${entry.slug}.jpg`, kb: Math.round(size / 1024), lead: entry.lead, meta });
  console.log(`${entry.slug}: ${meta.author} · ${meta.license}`);
}

const missing = Object.keys(DISHES).filter((slug) => !rows.some((row) => row.slug === slug));
const md = [
  "# Demo photo credits",
  "",
  "The photos below ship with the seeded Cafe Aroma demo menu. Each is an openly",
  "licensed image from Wikimedia Commons, cropped to a square; the original",
  "author and licence are kept. They are illustrative: a photo may show a",
  "similar dish rather than the exact recipe. Follow the source link for the",
  "full terms.",
  "",
  "| Dish | File | Author | Licence | Source |",
  "|---|---|---|---|---|",
  ...rows.map(
    (row) =>
      `| ${row.lead.title} | \`${row.file}\` | ${row.meta.author} | ${row.meta.license} | [Commons](${
        row.meta.sourceUrl || `https://en.wikipedia.org/wiki/${encodeURIComponent(row.lead.title)}`
      }) |`
  ),
  "",
  missing.length > 0
    ? `Missing: ${missing.map((slug) => `\`${slug}.jpg\``).join(", ")} — re-run \`node scripts/fetch-demo-images.mjs\`.`
    : "",
  "",
];
await writeFile(ATTRIBUTION, md.join("\n"), "utf8");
console.log(`\n${rows.length}/${Object.keys(DISHES).length} photos written to public/demo`);
if (missing.length > 0) console.log(`missing: ${missing.join(", ")}`);
