import { describe, expect, it } from 'vitest';
import { runDetectors } from '../detection/patterns';
import { assignTokens } from '../redaction/tokeniser';
import { redact } from '../redaction/textRedactor';
import { buildMapping } from '../redaction/mappingExporter';

// Issue 11 / PRD story 33: "no network requests after initial app + model load".
// The model lives in Cache Storage and the app shell in the service-worker
// precache, so a redaction run must touch the network zero times. We can't drive
// the browser SW from a node test, but we *can* assert the thing that backs the
// claim: the redaction pipeline itself issues no outbound calls. Every network
// primitive a leak could ride out on is replaced with a recorder for the
// duration of the (fully synchronous) run; any call is captured and fails the
// test, so a future dependency that quietly adds a fetch can't slip past CI.
//
// The trap is installed and torn down *synchronously* around the pipeline so
// vitest's own RPC — which rides on these same globals between tests — never
// sees the stubs. The NER layer needs the 770 MB model and a browser runtime, so
// it isn't exercised here; this guards the regex → tokenise → redact → mapping
// path that runs identically in the worker. The model fetch is the one
// sanctioned network call and happens before this stage, behind the consent gate.

const NET_GLOBALS = ['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource'] as const;

// Replace every present network primitive with a recorder, run `body`
// synchronously, then restore. Returns the list of attempted calls.
function recordNetworkDuring(body: () => void): string[] {
  const calls: string[] = [];
  const g = globalThis as Record<string, unknown>;
  const saved = new Map<string, unknown>();

  for (const name of NET_GLOBALS) {
    if (typeof g[name] === 'undefined') continue;
    saved.set(name, g[name]);
    g[name] = (...args: unknown[]) => {
      calls.push(`${name}(${String(args[0])})`);
      throw new Error(`Unexpected network call via ${name}: ${String(args[0])}`);
    };
  }
  const beacon =
    typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      ? navigator.sendBeacon
      : undefined;
  if (beacon) {
    navigator.sendBeacon = ((url: string) => {
      calls.push(`sendBeacon(${url})`);
      return false;
    }) as typeof navigator.sendBeacon;
  }

  try {
    body();
  } finally {
    for (const [name, value] of saved) g[name] = value;
    if (beacon) navigator.sendBeacon = beacon;
  }
  return calls;
}

describe('redaction pipeline makes no network calls', () => {
  const document = [
    'Reporter: Alice Chen <alice.chen@example.com>, phone +1 (415) 555-0142.',
    'Card 4111 1111 1111 1111, SSN 123-45-6789, token sk-live-9f8a7b6c5d4e3f2a.',
    'Follow up with alice.chen@example.com and bob@vendor.io before 2026-03-14.',
  ].join('\n');

  it('detects, tokenises, redacts and builds a mapping with zero outbound traffic', () => {
    let output = '';
    let mappingTokenCount = 0;
    let spanCount = 0;

    const calls = recordNetworkDuring(() => {
      const spans = runDetectors(document);
      spanCount = spans.length;
      const tokens = assignTokens(spans);
      output = redact(document, spans, tokens);
      mappingTokenCount = Object.keys(buildMapping(tokens.entries, 'ticket.txt').tokens).length;
    });

    // ...nothing left the machine to do it.
    expect(calls).toEqual([]);
    // The redaction really happened (not a vacuous pass).
    expect(spanCount).toBeGreaterThan(0);
    expect(mappingTokenCount).toBeGreaterThan(0);
    expect(output).toContain('<EMAIL_1>');
    expect(output).not.toContain('alice.chen@example.com');
  });

  it('reuses one token per repeated value without any lookup over the wire', () => {
    let output = '';
    const calls = recordNetworkDuring(() => {
      const spans = runDetectors(document);
      output = redact(document, spans, assignTokens(spans));
    });

    expect(calls).toEqual([]);
    // alice.chen@example.com appears twice → one token, both occurrences masked.
    expect(output.match(/<EMAIL_1>/g)).toHaveLength(2);
  });
});
