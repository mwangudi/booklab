import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const branches = [
    { name: 'Luanda', code: 'LUA', location: 'Near Equity Bank' },
    { name: 'Kapsabet', code: 'KAP', location: 'Next to Bata' },
    { name: 'Mumias', code: 'MUM', location: 'Opp Muslim Primary' },
  ];
  for (const b of branches) await prisma.branch.upsert({ where: { name: b.name }, update: { code: b.code }, create: b });
  const main = await prisma.branch.findUnique({ where: { name: 'Luanda' } });
  const westlands = await prisma.branch.findUnique({ where: { name: 'Kapsabet' } });

  // Never hardcode these. A committed password ends up published, and this repo
  // was public. Set SEED_ADMIN_PASSWORD / SEED_CASHIER_PASSWORD before seeding.
  const seedPassword = (envVar: string): string => {
    const v = process.env[envVar];
    if (!v || v.length < 8) {
      throw new Error(`${envVar} must be set to at least 8 characters before seeding.`);
    }
    return v;
  };

  const adminHash = await bcrypt.hash(seedPassword('SEED_ADMIN_PASSWORD'), 10);
  await prisma.user.upsert({
    where: { email: 'admin@booklabbookshop.co.ke' },
    update: {},
    create: { email: 'admin@booklabbookshop.co.ke', username: 'admin', name: 'Booklab Admin', passwordHash: adminHash, role: Role.ADMIN, branchId: main?.id ?? null },
  });

  const cashierHash = await bcrypt.hash(seedPassword('SEED_CASHIER_PASSWORD'), 10);
  await prisma.user.upsert({
    where: { email: 'cashier@booklabbookshop.co.ke' },
    update: {},
    create: { email: 'cashier@booklabbookshop.co.ke', username: 'kapsabet.cashier', name: 'Kapsabet Cashier', passwordHash: cashierHash, role: Role.CASHIER, branchId: westlands?.id ?? null },
  });

  // The shop sells more than books: textbooks, exercise books, story books and
  // general stationery. The `category` field doubles as the product type, and
  // `author`/`isbn` are only set for the book-type items.
  const books: Array<{ title: string; author?: string; isbn?: string; sku: string; category: string; unitPrice: number; costPrice: number }> = [
    // Novels & set books
    { title: 'The River and the Source', author: 'Margaret Ogola', sku: 'BK-0001', isbn: '9789966461964', category: 'Novel', unitPrice: 850, costPrice: 520 },
    { title: 'Things Fall Apart', author: 'Chinua Achebe', sku: 'BK-0002', isbn: '9780385474542', category: 'Novel', unitPrice: 1200, costPrice: 780 },
    { title: 'Blossoms of the Savannah', author: 'Henry Ole Kulet', sku: 'BK-0005', category: 'Novel', unitPrice: 900, costPrice: 560 },
    // Textbooks
    { title: 'KCSE Revision Mathematics', author: 'KLB', sku: 'BK-0003', category: 'Textbook', unitPrice: 650, costPrice: 400 },
    { title: 'KLB Secondary Biology Form 2', author: 'KLB', sku: 'BK-0006', category: 'Textbook', unitPrice: 780, costPrice: 500 },
    { title: 'Primary Mathematics Standard 5', author: 'KLB', sku: 'BK-0007', category: 'Textbook', unitPrice: 620, costPrice: 390 },
    // Reference
    { title: 'Oxford English Dictionary', author: 'Oxford', sku: 'BK-0004', isbn: '9780199571123', category: 'Reference', unitPrice: 2500, costPrice: 1700 },
    // Story / children's books
    { title: 'The Gruffalo', author: 'Julia Donaldson', sku: 'SB-0001', isbn: '9780333710937', category: 'Children', unitPrice: 950, costPrice: 600 },
    { title: 'Goosebumps: Welcome to Dead House', author: 'R. L. Stine', sku: 'SB-0002', isbn: '9780590453653', category: 'Story Book', unitPrice: 700, costPrice: 430 },
    // Exercise books
    { title: 'Kasuku A4 Exercise Book 200pg', sku: 'EX-0001', category: 'Exercise Book', unitPrice: 120, costPrice: 75 },
    { title: 'Kasuku A5 Exercise Book 96pg', sku: 'EX-0002', category: 'Exercise Book', unitPrice: 55, costPrice: 32 },
    { title: 'Graph Book A4 64pg', sku: 'EX-0003', category: 'Exercise Book', unitPrice: 90, costPrice: 55 },
    // Stationery
    { title: 'Bic Ballpoint Pen (Blue)', sku: 'SN-0001', category: 'Stationery', unitPrice: 25, costPrice: 12 },
    { title: 'HB Pencil', sku: 'SN-0002', category: 'Stationery', unitPrice: 15, costPrice: 7 },
    { title: '30cm Plastic Ruler', sku: 'SN-0003', category: 'Stationery', unitPrice: 40, costPrice: 22 },
    { title: 'Pencil Eraser', sku: 'SN-0004', category: 'Stationery', unitPrice: 20, costPrice: 9 },
    // Office supplies & art
    { title: 'A4 Photocopy Paper (Ream, 500 sheets)', sku: 'OS-0001', category: 'Office Supplies', unitPrice: 650, costPrice: 500 },
    { title: 'Manila Paper (Assorted colours)', sku: 'AC-0001', category: 'Art & Craft', unitPrice: 30, costPrice: 15 },
    // Lab equipment & science
    { title: 'Test Tubes (Pack of 10)', sku: 'LB-0001', category: 'Lab Equipment', unitPrice: 350, costPrice: 220 },
    { title: 'Microscope Slides (Box of 50)', sku: 'LB-0002', category: 'Lab Equipment', unitPrice: 480, costPrice: 300 },
    { title: 'Litmus Paper (Blue & Red)', sku: 'LB-0003', category: 'Lab Equipment', unitPrice: 150, costPrice: 90 },
    // Computers & IT
    { title: 'USB Flash Disk 32GB', sku: 'IT-0001', category: 'Computers & IT', unitPrice: 750, costPrice: 520 },
    { title: 'HP 680 Ink Cartridge (Black)', sku: 'IT-0002', category: 'Computers & IT', unitPrice: 1350, costPrice: 980 },
  ];
  for (const bk of books) await prisma.book.upsert({ where: { sku: bk.sku }, update: {}, create: bk });

  if (main) {
    const allBooks = await prisma.book.findMany();
    for (const bk of allBooks) {
      await prisma.stock.upsert({
        where: { branchId_bookId: { branchId: main.id, bookId: bk.id } },
        update: {},
        create: { branchId: main.id, bookId: bk.id, quantity: 40 },
      });
    }
  }

  const expenses = [
    { category: 'RENT' as const, description: 'Monthly shop rent', amount: 45000 },
    { category: 'SALARY' as const, description: 'Staff salaries', amount: 120000 },
    { category: 'UTILITIES' as const, description: 'Electricity + internet', amount: 8500 },
  ];
  for (const e of expenses) {
    const exists = await prisma.expense.findFirst({ where: { description: e.description } });
    if (!exists) await prisma.expense.create({ data: { category: e.category, description: e.description, amount: e.amount, branchId: main?.id ?? null } });
  }

  console.log('Seed complete. Sign in as "admin" or "kapsabet.cashier" with the passwords you supplied.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
