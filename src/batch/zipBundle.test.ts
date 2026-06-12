import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bundleMappingsZip, bundleOutputsZip, hasMappings } from './zipBundle';
import type { BatchOutput } from './batch';

function output(name: string, body: string, mapping?: { name: string; body: string }): BatchOutput {
  return {
    outputName: name,
    blob: new Blob([body], { type: 'text/plain' }),
    mapping: mapping
      ? { name: mapping.name, blob: new Blob([mapping.body], { type: 'application/json' }) }
      : undefined,
  };
}

async function entryNames(blob: Blob): Promise<string[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Object.keys(unzipSync(bytes)).sort();
}

async function entryText(blob: Blob, name: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new TextDecoder().decode(unzipSync(bytes)[name]);
}

// Fixed *local* date so the stamp is timezone-independent (Date(y, m, d) uses
// local components, which localDateStamp reads back).
const JUNE_12 = new Date(2026, 5, 12);

describe('bundleOutputsZip', () => {
  // Core behaviour: every succeeded output goes into one dated archive under its
  // own redactedName, and the bytes round-trip.
  it('bundles every output under its name with a dated filename', async () => {
    const zip = await bundleOutputsZip(
      [output('a.redacted.txt', 'alpha'), output('b.redacted.pdf', 'bravo')],
      JUNE_12,
    );
    expect(zip.name).toBe('my-redacted-documents-20260612.zip');
    expect(await entryNames(zip.blob)).toEqual(['a.redacted.txt', 'b.redacted.pdf']);
    expect(await entryText(zip.blob, 'a.redacted.txt')).toBe('alpha');
  });

  // Edge case: two inputs colliding on output name must both survive — the
  // second is disambiguated with a numeric suffix, never silently dropped.
  it('disambiguates duplicate names deterministically', async () => {
    const zip = await bundleOutputsZip(
      [output('notes.redacted.txt', 'first'), output('notes.redacted.txt', 'second')],
      JUNE_12,
    );
    expect(await entryNames(zip.blob)).toEqual(['notes.redacted (2).txt', 'notes.redacted.txt']);
    expect(await entryText(zip.blob, 'notes.redacted.txt')).toBe('first');
    expect(await entryText(zip.blob, 'notes.redacted (2).txt')).toBe('second');
  });

  // A Batch of one still produces a valid single-entry zip.
  it('produces a valid single-entry zip for a Batch of one', async () => {
    const zip = await bundleOutputsZip([output('only.redacted.txt', 'solo')], JUNE_12);
    expect(await entryNames(zip.blob)).toEqual(['only.redacted.txt']);
  });
});

describe('bundleMappingsZip', () => {
  // Core behaviour: only the opted-in mappings are bundled — never the redacted
  // outputs — under a distinct dated filename.
  it('bundles only the mappings, separately from the outputs', async () => {
    const outputs = [
      output('a.redacted.txt', 'alpha', { name: 'a.redactyl-mapping.json', body: '{"a":1}' }),
      output('b.redacted.txt', 'bravo'),
      output('c.redacted.txt', 'charlie', { name: 'c.redactyl-mapping.json', body: '{"c":1}' }),
    ];
    const zip = await bundleMappingsZip(outputs, JUNE_12);
    expect(zip).not.toBeNull();
    expect(zip!.name).toBe('my-redacted-documents-mappings-20260612.zip');
    const names = await entryNames(zip!.blob);
    expect(names).toEqual(['a.redactyl-mapping.json', 'c.redactyl-mapping.json']);
    // No redacted output ever co-located with a mapping.
    expect(names.some((n) => n.includes('redacted'))).toBe(false);

    // And the outputs zip never carries a mapping.
    const outputsZip = await bundleOutputsZip(outputs, JUNE_12);
    const outputNames = await entryNames(outputsZip.blob);
    expect(outputNames.some((n) => n.includes('mapping'))).toBe(false);
  });

  // Edge case: no Document opted in → no mappings bundle is offered.
  it('returns null when no Document opted into a mapping', async () => {
    const outputs = [output('a.redacted.txt', 'alpha'), output('b.redacted.txt', 'bravo')];
    expect(hasMappings(outputs)).toBe(false);
    expect(await bundleMappingsZip(outputs, JUNE_12)).toBeNull();
  });
});
