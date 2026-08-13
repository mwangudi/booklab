import fs from 'node:fs';
const src = fs.readFileSync('prisma/schema.prisma', 'utf8');
for (const name of process.argv.slice(2)) {
  const m = src.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  console.log(`=== ${name} ===`);
  console.log(m ? m[1].split('\n').map((l) => l.trim()).filter(Boolean).join('\n') : '(not found)');
  console.log();
}
