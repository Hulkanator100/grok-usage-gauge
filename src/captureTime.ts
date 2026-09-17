/** Prefer dates inside a dropped file over the form clock so a same-day dump of older shots still plots on their own days. */

export interface CaptureStamp {
  iso: string;
  source: "text" | "exif" | "filename" | "file-date" | "fallback";
  note: string;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function coerceIso(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/\u202f/g, " ");
  if (!trimmed) return undefined;
  const exif = trimmed.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (exif) {
    const d = new Date(
      Number(exif[1]),
      Number(exif[2]) - 1,
      Number(exif[3]),
      Number(exif[4]),
      Number(exif[5]),
      Number(exif[6]),
    );
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const isoish = trimmed.match(
    /^(20\d{2}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/,
  );
  if (isoish) {
    const d = new Date(isoish[2] ? trimmed.replace(" ", "T") : `${isoish[1]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return undefined;
}

function looksLikeResetClause(around: string): boolean {
  return /\b(resets?|period\s+end|expires?|renews?|empty-at)\b/i.test(around);
}

export function parseEmbeddedCaptureTime(text: string): string | undefined {
  if (!text) return undefined;
  const captured = text.match(
    /(?:captured(?:\s*at)?|taken(?:\s*at)?|last\s+updated|as\s+of)\s*[:-]?\s*([^\n]+)/i,
  );
  if (captured) {
    const iso = coerceIso(captured[1].trim().split(/\s{2,}/)[0]!);
    if (iso) return iso;
  }

  const withoutReset = text.replace(/\b(resets?|period\s+end|expires?|renews?)[^\n]{0,80}/gi, " ");
  const iso = withoutReset.match(
    /\b(20\d{2}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)\b/,
  );
  if (iso && !looksLikeResetClause(withoutReset.slice(Math.max(0, (iso.index ?? 0) - 24), (iso.index ?? 0) + 12))) {
    const value = coerceIso(iso[1]);
    if (value) return value;
  }

  const named = withoutReset.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i,
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    let hour = named[4] ? Number(named[4]) : 12;
    const min = named[5] ? Number(named[5]) : 0;
    const sec = named[6] ? Number(named[6]) : 0;
    const ap = named[7]?.toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    const d = new Date(Number(named[3]), month, Number(named[2]), hour, min, sec);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

export function parseFilenameCaptureTime(name: string): string | undefined {
  const base = name.replace(/\.(png|jpe?g|webp|gif|txt|md|json|csv|log)$/i, "");
  const compact = base.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})(?:[_-]?(\d{2})(\d{2})(\d{2}))?/);
  if (compact) {
    const hour = compact[4] ? Number(compact[4]) : 12;
    const d = new Date(
      Number(compact[1]),
      Number(compact[2]) - 1,
      Number(compact[3]),
      hour,
      compact[5] ? Number(compact[5]) : 0,
      compact[6] ? Number(compact[6]) : 0,
    );
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const dashed = base.match(/\b(20\d{2}-\d{2}-\d{2})(?:[ T_-](\d{1,2})[._:](\d{2})[._:](\d{2}))?(?:\s*(am|pm))?/i);
  if (dashed) {
    let hour = dashed[2] ? Number(dashed[2]) : 12;
    const ap = dashed[5]?.toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    const d = new Date(
      `${dashed[1]}T${String(hour).padStart(2, "0")}:${dashed[3] ?? "00"}:${dashed[4] ?? "00"}`,
    );
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    const local = new Date(
      Number(dashed[1].slice(0, 4)),
      Number(dashed[1].slice(5, 7)) - 1,
      Number(dashed[1].slice(8, 10)),
      hour,
      dashed[3] ? Number(dashed[3]) : 0,
      dashed[4] ? Number(dashed[4]) : 0,
    );
    if (!Number.isNaN(local.getTime())) return local.toISOString();
  }
  return undefined;
}

function readU16(view: DataView, offset: number, le: boolean): number {
  return le ? view.getUint16(offset, true) : view.getUint16(offset, false);
}

function readU32(view: DataView, offset: number, le: boolean): number {
  return le ? view.getUint32(offset, true) : view.getUint32(offset, false);
}

function readAscii(buf: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...buf.subarray(offset, offset + length)).replace(/\0+$/, "");
}

function walkExifIfd(buf: Uint8Array, ifdOffset: number, le: boolean): { dateTime?: string; exifOffset?: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (ifdOffset + 2 > buf.length) return {};
  const count = readU16(view, ifdOffset, le);
  let dateTime: string | undefined;
  let exifOffset: number | undefined;
  for (let i = 0; i < count; i++) {
    const p = ifdOffset + 2 + i * 12;
    if (p + 12 > buf.length) break;
    const tag = readU16(view, p, le);
    const type = readU16(view, p + 2, le);
    const n = readU32(view, p + 4, le);
    const value = readU32(view, p + 8, le);
    if ((tag === 0x0132 || tag === 0x9003 || tag === 0x9004) && type === 2 && n >= 10) {
      const off = n <= 4 ? p + 8 : value;
      if (off + 19 <= buf.length) dateTime = coerceIso(readAscii(buf, off, Math.min(n, 32))) ?? dateTime;
    }
    if (tag === 0x8769) exifOffset = value;
  }
  return { dateTime, exifOffset };
}

export function parseTiffExifDate(tiff: Uint8Array): string | undefined {
  if (tiff.length < 8) return undefined;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!le && !be) return undefined;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd0 = readU32(view, 4, le);
  const first = walkExifIfd(tiff, ifd0, le);
  if (first.exifOffset != null) {
    const nested = walkExifIfd(tiff, first.exifOffset, le);
    if (nested.dateTime) return nested.dateTime;
  }
  return first.dateTime;
}

export function parseJpegExifDate(bytes: Uint8Array): string | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 4 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda) break;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1 && i + 4 + 6 < bytes.length) {
      const payload = bytes.subarray(i + 4, i + 2 + len);
      if (readAscii(payload, 0, 4) === "Exif") {
        return parseTiffExifDate(payload.subarray(6));
      }
    }
    i += 2 + len;
  }
  return undefined;
}

export async function parseImageExifDate(file: File): Promise<string | undefined> {
  if (!/^image\/(jpeg|jpg|pjpeg)/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return undefined;
  try {
    const buf = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
    return parseJpegExifDate(buf);
  } catch {
    return undefined;
  }
}

export async function resolveFileCapturedAt(
  file: File,
  extracted: string,
  fallbackIso: string,
): Promise<CaptureStamp> {
  const fromText = parseEmbeddedCaptureTime(extracted);
  if (fromText) {
    return {
      iso: fromText,
      source: "text",
      note: `Timestamp from dates inside ${file.name} (${fromText}) — not the form clock.`,
    };
  }
  const fromExif = await parseImageExifDate(file);
  if (fromExif) {
    return {
      iso: fromExif,
      source: "exif",
      note: `Timestamp from photo EXIF in ${file.name} (${fromExif}).`,
    };
  }
  const fromName = parseFilenameCaptureTime(file.name);
  if (fromName) {
    return {
      iso: fromName,
      source: "filename",
      note: `Timestamp from filename ${file.name} (${fromName}).`,
    };
  }
  if (file.lastModified > 0) {
    const iso = new Date(file.lastModified).toISOString();
    return {
      iso,
      source: "file-date",
      note: `Timestamp from file date of ${file.name} (${iso}), so a same-day drop of older shots still plots on their own days.`,
    };
  }
  return {
    iso: fallbackIso,
    source: "fallback",
    note: `Timestamp from the Timestamp field (${fallbackIso}).`,
  };
}
