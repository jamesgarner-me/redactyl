// One-off: rewrite the synthetic TFNs in the Havenfield dummy-PII test file so
// every one passes the ATO weighted mod-11 checksum. The app's TFN regex is
// checksum-gated, so randomly-generated TFNs (25 of 30 here) wouldn't be caught
// — this makes the fixture exercise the detector the way real TFNs would.
//
// Strategy: keep already-valid TFNs untouched; for each invalid one, fix the
// last digit (smallest possible change), falling back to a brute-force search
// if the last-digit fix is impossible or collides. Replaces every occurrence
// (contact block + prose repeats), preserving the `NNN NNN NNN` format.
import { readFileSync, writeFileSync, copyFileSync } from 'fs';

const FILE = process.argv[2];
const W = [1, 4, 3, 7, 5, 8, 6, 9, 10];

const digitsOf = (s) => s.replace(/\D/g, '');
const valid = (d) => {
  d = digitsOf(d);
  if (d.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (d.charCodeAt(i) - 48) * W[i];
  return sum % 11 === 0;
};
const group = (d) => `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;

let text = readFileSync(FILE, 'utf8');

// Distinct TFN values in first-appearance order.
const distinct = [];
const seen = new Set();
for (const m of text.matchAll(/TFN (\d{3} \d{3} \d{3})/g)) {
  if (!seen.has(m[1])) {
    seen.add(m[1]);
    distinct.push(m[1]);
  }
}

// Final set must stay 30-distinct: seed `used` with the valids we keep.
const used = new Set(distinct.filter(valid).map(digitsOf));
const mapping = [];

for (const orig of distinct) {
  const d = digitsOf(orig);
  if (valid(d)) continue; // keep as-is

  // Last-digit fix: with weight 10 ≡ -1 (mod 11), the check digit must equal
  // (sum of the first 8 weighted digits) mod 11. If that's 10 it's unusable.
  let partial = 0;
  for (let i = 0; i < 8; i++) partial += (d.charCodeAt(i) - 48) * W[i];
  const check = partial % 11;

  let next = null;
  if (check <= 9) {
    const cand = d.slice(0, 8) + String(check);
    if (!used.has(cand)) next = cand;
  }
  if (next === null) {
    // Brute force upward from the original, keeping 9 digits with leading zeros.
    let n = parseInt(d, 10);
    for (let step = 0; step < 1_000_000; step++) {
      n = (n + 1) % 1_000_000_000;
      const cand = String(n).padStart(9, '0');
      if (valid(cand) && !used.has(cand)) {
        next = cand;
        break;
      }
    }
  }
  if (next === null) throw new Error(`no replacement found for ${orig}`);

  used.add(next);
  mapping.push([orig, group(next)]);
}

// Apply replacements. Each original TFN value is distinct, so a global swap of
// the grouped string is unambiguous and covers contact + prose occurrences.
let totalReplaced = 0;
for (const [from, to] of mapping) {
  const before = text;
  text = text.split(from).join(to);
  totalReplaced += (before.length - text.length === 0 && from !== to) ? 0 : 0; // noop guard
}

copyFileSync(FILE, FILE + '.bak');
writeFileSync(FILE, text);

console.log(`kept valid: ${distinct.length - mapping.length}, rewritten: ${mapping.length}`);
console.log('mapping (original -> valid):');
for (const [from, to] of mapping) console.log(`  ${from} -> ${to}`);

// Verify the result.
const after = [...text.matchAll(/TFN (\d{3} \d{3} \d{3})/g)].map((m) => m[1]);
const afterDistinct = new Set(after);
console.log(`\nafter: ${after.length} occurrences, ${afterDistinct.size} distinct`);
console.log(`all valid: ${[...afterDistinct].every(valid)}`);
