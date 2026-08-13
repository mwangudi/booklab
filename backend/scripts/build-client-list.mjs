// Turns the two client spreadsheets in docs/ into one cleaned CSV ready to
// import when the shop goes live. Re-run after editing either spreadsheet:
//   node scripts/build-client-list.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCES = [
  '../docs/BOOKLAB BOOKSHOP SCHOOLS.xlsx',
  '../docs/Book1.xlsx myahudi.xlsx',
];
const OUT = '../docs/booklab-clients.csv';

// Plain misspellings in the source. The name is printed on every invoice and
// statement, so these are corrected rather than carried through.
const SPELLING = new Map([
  ['EBUSILOLI JIUNIOR SCHOOL', 'EBUSILOLI JUNIOR SCHOOL'],
  ['MIRO PRIMAY SCHOOL', 'MIRO PRIMARY SCHOOL'],
  ['MUNDOLI PRIMARY SCJHOOL', 'MUNDOLI PRIMARY SCHOOL'],
  ['WAMBUSA JUNIOR SCCHOOL', 'WAMBUSA JUNIOR SCHOOL'],
  ['KULUWINU PRIMAY SCHOOL', 'KULUWINU PRIMARY SCHOOL'],
  ['MAHANGA PRIMARY SHOOL', 'MAHANGA PRIMARY SCHOOL'],
]);

// Names the PM has confirmed against the source rows. Several were the same
// school written two ways, and the level was wrong on most of them. Mushinaka
// and Musinaaka look alike but are two different schools.
const CONFIRMED = new Map([
  ['MUSHINAKA PRIMARY SCHOOL', 'MUSHINAKA JUNIOR SCHOOL'],
  ['MUSINAKA PRIMARY SCHOOL', 'MUSINAAKA JUNIOR SCHOOL'],
  ['ESIANDAMBA PRIMARY SCHOOL', 'ESIANDUMBA JUNIOR SCHOOL'],
  ['ESIANDUMBA SECONDARY SCHOOL', 'ESIANDUMBA JUNIOR SCHOOL'],
  ['EMMALOBA PRIMARY SCHOOL', 'EMMALOBA JUNIOR SCHOOL'],
  ['EMALLOBA JUNIOR SCHOOL', 'EMMALOBA JUNIOR SCHOOL'],
  ['EMMTSI PRIMARY SCHOOL', 'EMMATSI JUNIOR SCHOOL'],
  ['MCHULA JUNIOR SCHOOL', 'MUCHULA JUNIOR SCHOOL'],
  ['MUCHULA PRIMARY SCHOOL', 'MUCHULA JUNIOR SCHOOL'],
]);

// Shorthand in the second spreadsheet for a school already in the first.
const MERGE = new Map([
  ['BULANDA AC', 'BULANDA A.C COMPREHENSIVE SCHOOL'],
  ['KIJANA GLOBEL', 'KIJANA GLOBAL SCHOOL'],
]);

const decode = (s) =>
  String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

function cells(path) {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
  try {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${path.replace(/'/g, "''")}', '${dir}')`]);
    const strings = [];
    const ss = join(dir, 'xl', 'sharedStrings.xml');
    if (existsSync(ss)) {
      const xml = readFileSync(ss, 'utf8');
      for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? [])
        strings.push(decode([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
    }
    const out = [];
    for (const f of readdirSync(join(dir, 'xl', 'worksheets')).filter((n) => n.endsWith('.xml'))) {
      const xml = readFileSync(join(dir, 'xl', 'worksheets', f), 'utf8');
      for (const c of xml.match(/<c[^>]*?(\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
        if (v == null) continue;
        const val = /t="s"/.test(c) ? strings[Number(v)] : decode(v);
        if (val && String(val).trim()) out.push(String(val));
      }
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const tidy = (s) => s.trim().replace(/\s+/g, ' ');
const key = (s) => tidy(s).toUpperCase().replace(/[.']/g, '');

const kept = new Map();
let read = 0, corrected = 0, confirmed = 0, merged = 0, duplicate = 0;

for (const src of SOURCES) {
  for (const raw of cells(src)) {
    read += 1;
    let name = tidy(raw);
    const upper = name.toUpperCase();
    if (SPELLING.has(upper)) { name = SPELLING.get(upper); corrected += 1; }
    if (CONFIRMED.has(key(name))) { name = CONFIRMED.get(key(name)); confirmed += 1; }
    if (MERGE.has(key(name))) { name = MERGE.get(key(name)); merged += 1; }
    const finalKey = key(name);
    if (kept.has(finalKey)) { duplicate += 1; continue; }
    kept.set(finalKey, name);
  }
}

const names = [...kept.values()].sort((a, b) => a.localeCompare(b));
const header = 'name,type,contactPerson,phone,email,address,kraPin,paymentTermsDays,chargeVat,vatMode,openingBalance';
const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const lines = names.map((n) => [esc(n), 'SCHOOL', '', '', '', '', '', '30', '', '', '0'].join(','));
writeFileSync(OUT, [header, ...lines].join('\n') + '\n', 'utf8');

console.log(`read       ${read}`);
console.log(`corrected  ${corrected}  (spelling)`);
console.log(`confirmed  ${confirmed}  (renamed by the PM)`);
console.log(`merged     ${merged}  (shorthand for a school already listed)`);
console.log(`duplicate  ${duplicate}  (collapsed into an existing name)`);
console.log(`written    ${names.length} -> ${OUT}`);
