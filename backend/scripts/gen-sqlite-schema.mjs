// Derives a SQLite-compatible Prisma schema from the canonical MySQL schema.prisma.
// SQLite (via Prisma) has no native enums or MySQL `@db.*` types, so we switch the
// datasource, drop enum blocks (rewriting enum-typed fields to String + quoting their
// defaults), and strip `@db.*` attributes. Run: node scripts/gen-sqlite-schema.mjs
import fs from 'node:fs';

const SRC = 'prisma/schema.prisma';
const DEST = 'prisma/schema.sqlite.prisma';
let src = fs.readFileSync(SRC, 'utf8');

// 1. Datasource → sqlite (branch DB is a local file).
src = src.replace(/datasource\s+db\s*\{[\s\S]*?\}/, 'datasource db {\n  provider = "sqlite"\n  url      = env("BRANCH_DATABASE_URL")\n}');

// 2. Generator. BRANCH_BUILD=1 → default @prisma/client (real branch build); else a
//    separate path so the MySQL client stays intact locally.
const branchBuild = process.env.BRANCH_BUILD === '1';
src = src.replace(
  /generator\s+client\s*\{[\s\S]*?\}/,
  branchBuild ? 'generator client {\n  provider = "prisma-client-js"\n}' : 'generator client {\n  provider = "prisma-client-js"\n  output   = "../generated/prisma-sqlite"\n}',
);

// 3. Collect + remove enum blocks.
const enumNames = [];
const enumValues = new Set();
src = src.replace(/enum\s+(\w+)\s*\{([\s\S]*?)\}/g, (_m, name, body) => {
  enumNames.push(name);
  for (const line of body.split('\n').map((s) => s.trim()).filter(Boolean)) if (/^[A-Za-z_]\w*$/.test(line)) enumValues.add(line);
  return '';
});

// 4. Rewrite enum-typed fields to String.
for (const en of enumNames) src = src.replace(new RegExp(`(\\s)${en}(\\??)(\\s)`, 'g'), (_m, pre, opt, post) => `${pre}String${opt}${post}`);

// 5. Quote enum default values (@default(RENT) → @default("RENT")).
src = src.replace(/@default\(([A-Za-z_]\w*)\)/g, (m, id) => (enumValues.has(id) ? `@default("${id}")` : m));

// 6. Strip MySQL native type attributes.
src = src.replace(/\s*@db\.\w+(\([^)]*\))?/g, '');

// 7. Tidy blank lines.
src = src.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(DEST, '// AUTO-GENERATED from schema.prisma — do not edit by hand.\n// SQLite variant for the offline branch runtime.\n\n' + src.trimStart(), 'utf8');
console.log(`Wrote ${DEST} (enums→String: ${enumNames.join(', ')})`);
