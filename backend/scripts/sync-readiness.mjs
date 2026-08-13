// Which models carry the sync columns (uuid / updatedAt / deletedAt)?
import fs from 'node:fs';

const src = fs.readFileSync('prisma/schema.prisma', 'utf8');
const rows = [];
for (const m of src.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const [, name, body] = m;
  rows.push({
    name,
    uuid: /^\s*uuid\s/m.test(body),
    updatedAt: /^\s*updatedAt\s/m.test(body),
    deletedAt: /^\s*deletedAt\s/m.test(body),
  });
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('MODEL', 22) + pad('uuid', 7) + pad('updatedAt', 11) + 'deletedAt');
console.log('-'.repeat(52));
for (const r of rows) {
  console.log(pad(r.name, 22) + pad(r.uuid ? 'yes' : 'NO', 7) + pad(r.updatedAt ? 'yes' : 'NO', 11) + (r.deletedAt ? 'yes' : 'NO'));
}
const notSyncable = rows.filter((r) => !r.uuid).map((r) => r.name);
console.log('\nNo uuid (cannot sync as-is): ' + (notSyncable.join(', ') || 'none'));
