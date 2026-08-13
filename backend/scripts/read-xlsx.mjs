// Dump an .xlsx to rows without pulling in a dependency: the file is a zip of
// XML parts, so read the shared strings and walk each sheet.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';

const file = process.argv[2];
const maxRows = Number(process.argv[3] ?? 40);
if (!file) throw new Error('usage: node scripts/read-xlsx.mjs <file.xlsx> [maxRows]');

const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
try {
  execFileSync('powershell', [
    '-NoProfile', '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${file.replace(/'/g, "''")}', '${dir}')`,
  ]);

  const strings = [];
  const ssPath = join(dir, 'xl', 'sharedStrings.xml');
  if (existsSync(ssPath)) {
    const xml = readFileSync(ssPath, 'utf8');
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      const text = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('');
      strings.push(decode(text));
    }
  }

  const sheetDir = join(dir, 'xl', 'worksheets');
  const sheets = existsSync(sheetDir) ? readdirSync(sheetDir).filter((f) => f.endsWith('.xml')) : [];
  for (const sheet of sheets) {
    console.log(`\n===== ${sheet} =====`);
    const xml = readFileSync(join(sheetDir, sheet), 'utf8');
    const rows = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];
    console.log(`(${rows.length} rows)`);
    let shown = 0;
    for (const row of rows) {
      const cells = {};
      for (const c of row.match(/<c[^>]*?(\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = (c.match(/r="([A-Z]+)\d+"/) ?? [])[1];
        if (!ref) continue;
        const isShared = /t="s"/.test(c);
        const isInline = /t="inlineStr"/.test(c);
        let v = (c.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
        if (isInline) v = [...c.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('');
        if (v == null) continue;
        cells[ref] = isShared ? strings[Number(v)] : decode(v);
      }
      const keys = Object.keys(cells);
      if (keys.length === 0) continue;
      shown += 1;
      if (shown > maxRows) continue;
      console.log('  ' + keys.map((k) => `${k}=${JSON.stringify(cells[k])}`).join('  '));
    }
    if (shown > maxRows) console.log(`  … ${shown - maxRows} more non-empty rows`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function decode(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}
