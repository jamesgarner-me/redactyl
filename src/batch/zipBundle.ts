import { zipSync, type Zippable } from 'fflate';
import type { BatchOutput } from './batch';

// In-browser bundling of a completed Batch's outputs — see ADR 0005 and slices
// 02/03. Two deliberately separate archives: redacted outputs in one, opted-in
// Mapping sidecars in another, so a leaked redacted bundle never carries the key
// to reverse it. fflate's zipSync is pure JS (no worker), so it keeps working
// under cross-origin isolation.

export interface ZipFile {
  name: string;
  blob: Blob;
}

// `2026-06-12` -> `20260612`, using the *local* date at save time.
function localDateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Append ` (2)`, ` (3)`, … before the extension so a repeated output name never
// silently overwrites an earlier entry inside the zip. `notes.redacted.txt` ->
// `notes.redacted (2).txt`. Deterministic: first-seen keeps the bare name.
function disambiguate(name: string, seen: Set<string>): string {
  if (!seen.has(name)) {
    seen.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (seen.has(candidate)) {
    n += 1;
    candidate = `${base} (${n})${ext}`;
  }
  seen.add(candidate);
  return candidate;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function zipEntries(
  named: { name: string; blob: Blob }[],
  mtime: Date,
): Promise<Uint8Array> {
  const seen = new Set<string>();
  const entries: Zippable = {};
  for (const item of named) {
    const name = disambiguate(item.name, seen);
    entries[name] = await blobBytes(item.blob);
  }
  // A single mtime for every entry keeps the archive deterministic for a given
  // input set and save time (fflate requires a 1980–2099 date).
  return zipSync(entries, { mtime });
}

// Zip every succeeded redacted output into one archive named
// `my-redacted-documents-YYYYMMDD.zip` (local date). Mappings are NOT included
// here — they ship in their own bundle (see below).
export async function bundleOutputsZip(
  outputs: readonly BatchOutput[],
  date: Date = new Date(),
): Promise<ZipFile> {
  const bytes = await zipEntries(
    outputs.map((o) => ({ name: o.outputName, blob: o.blob })),
    date,
  );
  return {
    name: `my-redacted-documents-${localDateStamp(date)}.zip`,
    // Uint8Array.from yields an ArrayBuffer-backed copy (a valid BlobPart);
    // zipSync's return is typed over the broader ArrayBufferLike.
    blob: new Blob([Uint8Array.from(bytes)], { type: 'application/zip' }),
  };
}

// True when at least one Document in the Batch opted into a Mapping sidecar.
export function hasMappings(outputs: readonly BatchOutput[]): boolean {
  return outputs.some((o) => o.mapping);
}

// Zip only the opted-in Mapping sidecars into a *separate* archive named
// `my-redacted-documents-mappings-YYYYMMDD.zip` (local date) — never co-located
// with the redacted outputs. Returns null when no Document opted in.
export async function bundleMappingsZip(
  outputs: readonly BatchOutput[],
  date: Date = new Date(),
): Promise<ZipFile | null> {
  const mappings = outputs.flatMap((o) => (o.mapping ? [o.mapping] : []));
  if (mappings.length === 0) return null;
  const bytes = await zipEntries(mappings, date);
  return {
    name: `my-redacted-documents-mappings-${localDateStamp(date)}.zip`,
    blob: new Blob([Uint8Array.from(bytes)], { type: 'application/zip' }),
  };
}
