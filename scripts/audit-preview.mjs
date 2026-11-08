import fs from 'fs';

const file = process.argv[2] || 'scripts/out/preview-full-2026-11-03.json';
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const all = ['overview', 'indications', 'adverse_effects', 'contraindications', 'interactions'];

const counts = {};
d.forEach(x => { counts[x.status] = (counts[x.status] || 0) + 1; });
console.log('TOTAL', d.length, counts);

console.log('\n--- NON-FULL ---');
d.filter(x => x.status !== 'full').forEach(x => {
  const missing = all.filter(s => !(x.sections || []).includes(s));
  console.log(x.status.padEnd(8), x.name.padEnd(28), '|', x.fdaName || '-', '| missing:', missing.join(','));
});

console.log('\n--- POSSIBLE MISMATCHES (full, but FDA name lacks first word) ---');
d.filter(x => {
  if (x.status !== 'full' || !x.fdaName) return false;
  const first = x.name.toUpperCase().split(' ')[0];
  return !x.fdaName.toUpperCase().includes(first);
}).forEach(x => console.log(x.name, '->', x.fdaName));
