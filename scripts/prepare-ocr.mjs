import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(root, "public/tesseract");
const coreDest = resolve(dest, "core");
const langDest = resolve(dest, "lang");

mkdirSync(coreDest, { recursive: true });
mkdirSync(langDest, { recursive: true });

const worker = resolve(root, "node_modules/tesseract.js/dist/worker.min.js");
if (!existsSync(worker)) {
  console.warn("prepare-ocr: tesseract.js not installed yet; skip.");
  process.exit(0);
}

cpSync(worker, resolve(dest, "worker.min.js"));
const esm = resolve(root, "node_modules/tesseract.js/dist/tesseract.esm.min.js");
if (existsSync(esm)) cpSync(esm, resolve(dest, "tesseract.esm.min.js"));

for (const f of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
]) {
  const src = resolve(root, "node_modules/tesseract.js-core", f);
  if (existsSync(src)) cpSync(src, resolve(coreDest, f));
}

const trained = resolve(langDest, "eng.traineddata.gz");
if (!existsSync(trained)) {
  const url = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`prepare-ocr: could not download English OCR data (${res.status}). Screenshots still work if jsDelivr is allowed.`);
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    await import("node:fs/promises").then((fs) => fs.writeFile(trained, buf));
  }
}

console.log("prepare-ocr: same-origin Tesseract assets in public/tesseract");
