/**
 * Demo dataset for presentations.
 *
 * Generates a believable trading history so every screen has something to show:
 * stock at all three branches, ~2 months of sales across branches, payment
 * methods, price tiers and cashiers, a few voided sales and reprints, matching
 * stock movements, current-month expenses, employees and a closed payroll run.
 *
 *   npm run seed:demo     populate
 *   npm run seed:demo -- --clear   remove ALL transactional data
 *
 * `--clear` wipes sales, movements, payroll and demo expenses. Only run it
 * before go-live — it does not distinguish demo rows from real ones.
 */
import { PrismaClient, PaymentMethod, PriceTier, Role, StockMoveType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Never hardcode a password: this repository has been public.
const requireEnv = (name: string): string => {
  const v = process.env[name];
  if (!v || v.length < 8) throw new Error(`${name} must be set to at least 8 characters before seeding.`);
  return v;
};

/* ------------------------------------------------------------- utilities */

// Deterministic PRNG so re-running produces the same demo, not a new one.
let seed = 20260811;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;
const round2 = (n: number) => Math.round(n * 100) / 100;

const daysAgo = (d: number, hour = 10, minute = 0) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(hour, minute, 0, 0);
  return t;
};

/* ---------------------------------------------------------------- clear */

async function clearAll() {
  console.log('Clearing transactional data…');
  await prisma.$transaction([
    prisma.customerPayment.deleteMany({}),
    prisma.invoiceItem.deleteMany({}),
    prisma.invoice.deleteMany({}),
    prisma.customer.deleteMany({}),
    prisma.supplierPayment.deleteMany({}),
    prisma.goodsReceiptItem.deleteMany({}),
    prisma.goodsReceipt.deleteMany({}),
    prisma.supplier.deleteMany({}),
    prisma.saleItem.deleteMany({}),
    prisma.sale.deleteMany({}),
    prisma.stockMovement.deleteMany({}),
    prisma.payslip.deleteMany({}),
    prisma.payrollRun.deleteMany({}),
    prisma.employee.deleteMany({}),
    prisma.expense.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.mpesaPayment.deleteMany({}),
  ]);
  await prisma.stock.updateMany({ data: { quantity: 0 } });
  console.log('Cleared. Catalogue, branches and users were left untouched.');
}

/* ----------------------------------------------------------------- seed */

async function main() {
  const branches = await prisma.branch.findMany({ orderBy: { id: 'asc' } });
  if (branches.length === 0) throw new Error('No branches — run `npm run seed` first.');
  const [luanda, kapsabet, mumias] = branches;

  /* 1. A manager account so role-based access can be demonstrated. */
  const managerHash = await bcrypt.hash(requireEnv('SEED_MANAGER_PASSWORD'), 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@booklabbookshop.co.ke' },
    update: {},
    create: {
      email: 'manager@booklabbookshop.co.ke',
      name: 'Grace Wanjiru',
      passwordHash: managerHash,
      role: Role.MANAGER,
      branchId: luanda.id,
    },
  });
  const cashierHash = await bcrypt.hash(requireEnv('SEED_CASHIER_PASSWORD'), 10);
  const cashier2 = await prisma.user.upsert({
    where: { email: 'mumias.cashier@booklabbookshop.co.ke' },
    update: {},
    create: {
      email: 'mumias.cashier@booklabbookshop.co.ke',
      name: 'Peter Otieno',
      passwordHash: cashierHash,
      role: Role.CASHIER,
      branchId: mumias.id,
    },
  });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@booklabbookshop.co.ke' } });
  const cashier1 = await prisma.user.findUnique({ where: { email: 'cashier@booklabbookshop.co.ke' } });
  if (!admin || !cashier1) throw new Error('Base users missing — run `npm run seed` first.');

  /* 2. Give every product a real margin. The supplier import left some at cost. */
  const books = await prisma.book.findMany({ where: { deletedAt: null } });
  let repriced = 0;
  for (const b of books) {
    const cost = Number(b.costPrice);
    if (cost > 0 && Number(b.unitPrice) <= cost) {
      const retail = Math.max(5, Math.round((cost * 1.45) / 5) * 5);
      await prisma.book.update({
        where: { id: b.id },
        data: {
          unitPrice: retail,
          priceWholesale: Math.round((retail * 0.88) / 5) * 5,
          priceSchool: Math.round((retail * 0.92) / 5) * 5,
        },
      });
      repriced += 1;
    }
  }
  console.log(`Repriced ${repriced} products that were at or below cost.`);
  const catalogue = await prisma.book.findMany({ where: { deletedAt: null } });

  /* 3. Stock every branch, with a few deliberately low/out for the re-order report. */
  const stockPlan: Array<{ branchId: number; share: number }> = [
    { branchId: luanda.id, share: 1 },
    { branchId: kapsabet.id, share: 0.8 },
    { branchId: mumias.id, share: 0.62 },
  ];
  const openingMoves: Array<{ branchId: number; bookId: number; delta: number; type: StockMoveType; note: string; userId: number; originBranchId: number; createdAt: Date }> = [];
  for (const { branchId, share } of stockPlan) {
    for (const book of catalogue) {
      // Leave roughly one in ten products unstocked at the smaller branches.
      if (share < 1 && chance(0.1)) continue;
      const qty = Math.round(int(220, 420) * share);
      await prisma.stock.upsert({
        where: { branchId_bookId: { branchId, bookId: book.id } },
        create: { branchId, bookId: book.id, quantity: qty },
        update: { quantity: qty },
      });
      openingMoves.push({
        branchId, bookId: book.id, delta: qty, type: StockMoveType.INTAKE,
        note: 'Opening stock', userId: admin.id, originBranchId: branchId,
        createdAt: daysAgo(62, 8, int(0, 59)),
      });
      // Two restock deliveries during the period so intake history looks alive.
      for (const ago of [41, 19]) {
        if (chance(0.65)) {
          const top = Math.round(int(60, 160) * share);
          openingMoves.push({
            branchId, bookId: book.id, delta: top, type: StockMoveType.INTAKE,
            note: 'Supplier delivery', userId: manager.id, originBranchId: branchId,
            createdAt: daysAgo(ago, 9, int(0, 59)),
          });
          await prisma.stock.update({
            where: { branchId_bookId: { branchId, bookId: book.id } },
            data: { quantity: { increment: top } },
          });
        }
      }
    }
  }
  await prisma.stockMovement.createMany({ data: openingMoves });
  console.log(`Stocked all branches (${openingMoves.length} intake events).`);

  /* 4. Two months of trading. */
  const staff = [
    { user: cashier1, branchId: kapsabet.id },
    { user: cashier2, branchId: mumias.id },
    { user: manager, branchId: luanda.id },
    { user: admin, branchId: luanda.id },
  ];
  const tiers: PriceTier[] = [PriceTier.RETAIL, PriceTier.RETAIL, PriceTier.RETAIL, PriceTier.WHOLESALE, PriceTier.SCHOOL];
  const methods: PaymentMethod[] = [
    PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH,
    PaymentMethod.MPESA, PaymentMethod.MPESA, PaymentMethod.MPESA,
    PaymentMethod.CARD,
  ];
  // Daily transaction counts sized so trading comfortably covers rent and payroll.
  const branchLoad = [
    { branchId: luanda.id, base: 20, staff: staff.filter((s) => s.branchId === luanda.id) },
    { branchId: kapsabet.id, base: 14, staff: staff.filter((s) => s.branchId === kapsabet.id) },
    { branchId: mumias.id, base: 10, staff: staff.filter((s) => s.branchId === mumias.id) },
  ];

  const stockCache = new Map<string, number>();
  const onHand = async (branchId: number, bookId: number) => {
    const key = `${branchId}:${bookId}`;
    if (!stockCache.has(key)) {
      const row = await prisma.stock.findUnique({ where: { branchId_bookId: { branchId, bookId } } });
      stockCache.set(key, row?.quantity ?? 0);
    }
    return stockCache.get(key)!;
  };

  type Move = { branchId: number; bookId: number; delta: number; type: StockMoveType; note: string; userId: number; originBranchId: number; createdAt: Date };
  const moves: Move[] = [];
  // Fixed days so reversals appear recently as well as historically.
  const voidDays = new Set([1, 4, 9, 16, 27, 43]);
  const voidedOnDay = new Set<number>();
  const voidEvents: Array<{ id: number; branchId: number; total: number; reason: string; at: Date }> = [];
  const reprintEvents: Array<{ id: number; branchId: number; total: number; copies: number; at: Date; userId: number }> = [];
  let saleCount = 0;
  let voided = 0;

  for (let day = 60; day >= 0; day--) {
    const date = daysAgo(day);
    const dow = date.getDay();

    for (const load of branchLoad) {
      // Sundays are quiet, Saturdays busy, and term-opening week is the peak.
      let volume = dow === 0 ? Math.round(load.base * 0.3) : dow === 6 ? Math.round(load.base * 1.4) : load.base;
      volume += int(-3, 3);
      if (date.getDate() <= 6) volume = Math.round(volume * 1.5);
      if (volume < 1) continue;

      for (let i = 0; i < volume; i++) {
        const who = pick(load.staff.length ? load.staff : staff);
        const branchId = load.branchId;
        const tier = pick(tiers);
        const method = pick(methods);

        const items: Array<{ bookId: number; quantity: number; unitPrice: number; costPrice: number }> = [];
        for (let l = 0; l < int(1, 4); l++) {
          const book = pick(catalogue);
          if (items.some((x) => x.bookId === book.id)) continue;
          const available = await onHand(branchId, book.id);
          if (available <= 0) continue;
          const qty = Math.min(available, int(1, 3));
          const retail = Number(book.unitPrice);
          const unitPrice =
            tier === PriceTier.WHOLESALE ? Number(book.priceWholesale ?? retail)
            : tier === PriceTier.SCHOOL ? Number(book.priceSchool ?? retail)
            : retail;
          items.push({ bookId: book.id, quantity: qty, unitPrice: round2(unitPrice), costPrice: Number(book.costPrice) });
        }
        if (items.length === 0) continue;

        const total = round2(items.reduce((s, x) => s + x.quantity * x.unitPrice, 0));
        const createdAt = new Date(date);
        createdAt.setHours(int(8, 17), int(0, 59), int(0, 59), 0);

        // A handful of sales are reversed so voids and the audit trail have content.
        const isVoided = voidDays.has(day) && !voidedOnDay.has(day);
        if (isVoided) voidedOnDay.add(day);
        const voidReason = pick(['Wrong item scanned', 'Customer changed their mind', 'Duplicate transaction', 'Price entered incorrectly']);
        const copies = chance(0.05) ? int(1, 2) : 0;

        const sale = await prisma.sale.create({
          data: {
            branchId,
            userId: who.user.id,
            originBranchId: branchId,
            paymentMethod: method,
            priceTier: tier,
            mpesaRef: method === PaymentMethod.MPESA ? `SJ${int(10, 99)}${String(int(100000, 999999))}` : null,
            total,
            createdAt,
            reprintCount: copies,
            ...(isVoided
              ? { voidedAt: new Date(createdAt.getTime() + 36e5), voidedById: manager.id, voidReason }
              : {}),
            items: { create: items },
          },
          select: { id: true },
        });
        saleCount += 1;
        if (isVoided) voidEvents.push({ id: sale.id, branchId, total, reason: voidReason, at: new Date(createdAt.getTime() + 36e5) });
        if (copies > 0) reprintEvents.push({ id: sale.id, branchId, total, copies, at: new Date(createdAt.getTime() + 72e5), userId: who.user.id });

        for (const it of items) {
          moves.push({
            branchId, bookId: it.bookId, delta: -it.quantity, type: StockMoveType.SALE,
            note: `Sale #${sale.id}`, userId: who.user.id, originBranchId: branchId, createdAt,
          });
          if (isVoided) {
            moves.push({
              branchId, bookId: it.bookId, delta: it.quantity, type: StockMoveType.VOID,
              note: `Void of sale #${sale.id}`, userId: manager.id, originBranchId: branchId,
              createdAt: new Date(createdAt.getTime() + 36e5),
            });
          } else {
            const key = `${branchId}:${it.bookId}`;
            stockCache.set(key, (stockCache.get(key) ?? 0) - it.quantity);
          }
        }
        if (isVoided) voided += 1;
      }
    }
  }

  // Movements are written in batches — one insert per line would be far slower.
  for (let i = 0; i < moves.length; i += 1000) {
    await prisma.stockMovement.createMany({ data: moves.slice(i, i + 1000) });
  }

  // Push the in-memory stock levels back to the database in one pass.
  for (const [key, qty] of stockCache) {
    const [branchId, bookId] = key.split(':').map(Number);
    const quantity = Math.max(0, qty);
    await prisma.stock.upsert({
      where: { branchId_bookId: { branchId, bookId } },
      create: { branchId, bookId, quantity },
      update: { quantity },
    });
  }
  console.log(`Created ${saleCount} sales (${voided} voided) and ${moves.length} stock movements.`);

  /* 5. A couple of inter-branch transfers and a stock take. */
  const transferBooks = catalogue.slice(0, 3);
  for (const book of transferBooks) {
    const qty = int(5, 15);
    const when = daysAgo(int(8, 25), 11, int(0, 59));
    await prisma.stockMovement.createMany({
      data: [
        { branchId: luanda.id, bookId: book.id, delta: -qty, type: StockMoveType.TRANSFER_OUT, note: 'Branch transfer', userId: manager.id, originBranchId: luanda.id, createdAt: when },
        { branchId: mumias.id, bookId: book.id, delta: qty, type: StockMoveType.TRANSFER_IN, note: 'Branch transfer', userId: manager.id, originBranchId: luanda.id, createdAt: when },
      ],
    });
  }
  for (const book of catalogue.slice(5, 9)) {
    const delta = pick([-3, -2, -1, 2, 4]);
    await prisma.stockMovement.create({
      data: {
        branchId: kapsabet.id,
        bookId: book.id,
        delta,
        type: StockMoveType.ADJUST,
        note: delta < 0 ? 'Stock take: damaged/short' : 'Stock take: found',
        userId: manager.id,
        originBranchId: kapsabet.id,
        createdAt: daysAgo(int(3, 20), 16, int(0, 59)),
      },
    });
  }

  /* 6. Running costs, including the current month so month-to-date is not empty. */
  await prisma.expense.deleteMany({ where: { payrollRunId: null } });
  const costs: Array<[number | null, 'RENT' | 'UTILITIES' | 'SUPPLIES' | 'MARKETING' | 'MISC', string, number, number]> = [
    [luanda.id, 'RENT', 'Shop rent — Luanda', 45000, 38],
    [kapsabet.id, 'RENT', 'Shop rent — Kapsabet', 32000, 38],
    [mumias.id, 'RENT', 'Shop rent — Mumias', 28000, 38],
    [luanda.id, 'UTILITIES', 'Electricity & water', 8500, 34],
    [kapsabet.id, 'UTILITIES', 'Electricity & water', 6200, 34],
    [luanda.id, 'SUPPLIES', 'Packaging & till rolls', 4300, 30],
    [null, 'MARKETING', 'Radio advert — term opening', 18000, 27],
    [luanda.id, 'RENT', 'Shop rent — Luanda', 45000, 8],
    [kapsabet.id, 'RENT', 'Shop rent — Kapsabet', 32000, 8],
    [mumias.id, 'RENT', 'Shop rent — Mumias', 28000, 8],
    [luanda.id, 'UTILITIES', 'Electricity & water', 9100, 6],
    [kapsabet.id, 'UTILITIES', 'Electricity & water', 5800, 6],
    [mumias.id, 'SUPPLIES', 'Cleaning & packaging', 3600, 4],
    [null, 'MISC', 'Bank charges', 2400, 3],
    [luanda.id, 'SUPPLIES', 'Till rolls & receipt paper', 5200, 1],
  ];
  for (const [branchId, category, description, amount, ago] of costs) {
    await prisma.expense.create({
      data: { branchId, category, description, amount, incurredAt: daysAgo(ago, 12), originBranchId: branchId ?? undefined },
    });
  }
  console.log(`Recorded ${costs.length} operating expenses.`);

  /* 7. Employees, then a closed payroll run for last month. */
  await prisma.payslip.deleteMany({});
  await prisma.payrollRun.deleteMany({});
  await prisma.employee.deleteMany({});
  const people: Array<[string, string, string, string, number, number | null, number | null]> = [
    ['EMP-001', 'Grace', 'Wanjiru', 'Branch Manager', 85000, luanda.id, manager.id],
    ['EMP-002', 'Daniel', 'Kiprop', 'Senior Cashier', 45000, kapsabet.id, cashier1.id],
    ['EMP-003', 'Peter', 'Otieno', 'Cashier', 35000, mumias.id, cashier2.id],
    ['EMP-004', 'Mercy', 'Achieng', 'Sales Assistant', 28000, luanda.id, null],
    ['EMP-005', 'Samuel', 'Barasa', 'Storekeeper', 25000, kapsabet.id, null],
    ['EMP-006', 'Alice', 'Nafula', 'Cleaner', 18000, mumias.id, null],
  ];
  for (const [staffNo, firstName, lastName, jobTitle, basic, branchId, userId] of people) {
    await prisma.employee.create({
      data: {
        staffNo, firstName, lastName, jobTitle, branchId, userId,
        basicSalary: basic,
        houseAllowance: Math.round(basic * 0.15),
        transportAllowance: basic >= 40000 ? 8000 : 4000,
        nationalId: String(int(20000000, 39999999)),
        kraPin: `A${int(100000000, 999999999)}X`,
        phone: `07${int(10000000, 99999999)}`,
        hiredAt: daysAgo(int(200, 900)),
        bankName: pick(['Equity Bank', 'KCB', 'Co-operative Bank']),
        bankAccount: String(int(1000000000, 9999999999)),
      },
    });
  }
  console.log(`Added ${people.length} employees.`);

  /* 8. An audit trail that matches the trading history. */
  const ip = () => `41.90.${int(100, 199)}.${int(2, 250)}`;
  const audits: Array<{ userId: number | null; branchId: number | null; entity: string; entityId: number | null; action: string; details: string; ip: string; createdAt: Date }> = [];

  for (let day = 60; day >= 0; day--) {
    const who = [
      { u: admin, b: luanda.id },
      { u: manager, b: luanda.id },
      { u: cashier1, b: kapsabet.id },
      { u: cashier2, b: mumias.id },
    ];
    for (const w of who) {
      if (chance(0.75)) {
        audits.push({
          userId: w.u.id, branchId: w.b, entity: 'auth', entityId: null, action: 'LOGIN',
          details: JSON.stringify({ email: w.u.email, role: w.u.role }),
          ip: ip(), createdAt: daysAgo(day, int(7, 9), int(0, 59)),
        });
      }
    }
    if (chance(0.08)) {
      audits.push({
        userId: null, branchId: null, entity: 'auth', entityId: null, action: 'LOGIN_FAILED',
        details: JSON.stringify({ email: pick(['admin@booklabbookshop.co.ke', 'staff@booklabbookshop.co.ke']), reason: pick(['bad password', 'unknown email']) }),
        ip: ip(), createdAt: daysAgo(day, int(19, 23), int(0, 59)),
      });
    }
  }
  for (const v of voidEvents) {
    audits.push({
      userId: manager.id, branchId: v.branchId, entity: 'sale', entityId: v.id, action: 'VOID',
      details: JSON.stringify({ reason: v.reason, total: v.total }), ip: ip(), createdAt: v.at,
    });
  }
  for (const r of reprintEvents) {
    for (let c = 1; c <= r.copies; c++) {
      audits.push({
        userId: r.userId, branchId: r.branchId, entity: 'sale', entityId: r.id, action: 'REPRINT',
        details: JSON.stringify({ copy: c, total: r.total }), ip: ip(), createdAt: new Date(r.at.getTime() + c * 6e4),
      });
    }
  }
  for (const book of catalogue.slice(0, 6)) {
    audits.push({
      userId: manager.id, branchId: luanda.id, entity: 'stock.price', entityId: book.id, action: 'SET_PRICE',
      details: JSON.stringify({ from: null, to: Math.round(Number(book.unitPrice) * 1.05) }),
      ip: ip(), createdAt: daysAgo(int(5, 35), 14, int(0, 59)),
    });
    audits.push({
      userId: manager.id, branchId: kapsabet.id, entity: 'stock.quantity', entityId: book.id, action: 'STOCK_TAKE',
      details: JSON.stringify({ from: int(40, 90), to: int(40, 90), note: 'Monthly count' }),
      ip: ip(), createdAt: daysAgo(int(3, 30), 16, int(0, 59)),
    });
  }
  for (let i = 0; i < 4; i++) {
    audits.push({
      userId: admin.id, branchId: null, entity: 'book', entityId: catalogue[i].id, action: pick(['CREATE', 'UPDATE']),
      details: JSON.stringify({ sku: catalogue[i].sku, title: catalogue[i].title }),
      ip: ip(), createdAt: daysAgo(int(10, 50), 11, int(0, 59)),
    });
  }
  for (let i = 0; i < audits.length; i += 1000) {
    await prisma.auditLog.createMany({ data: audits.slice(i, i + 1000) });
  }
  console.log(`Wrote ${audits.length} audit entries.`);

  /* 9. Schools supplied on credit: invoices, deliveries and part payments. */
  const schools: Array<[string, string, string, string, number, number, boolean]> = [
    // name, contact, phone, address, opening balance, terms, chargeVat
    ['St. Mary’s Junior School', 'Sr. Agnes Wafula', '0712 445 890', 'P.O. Box 210, Luanda', 42950, 30, true],
    ['Kapsabet Boys High School', 'Mr. Kiptoo (Bursar)', '0722 118 340', 'P.O. Box 45, Kapsabet', 0, 30, true],
    ['Mumias Girls Academy', 'Mrs. Nekesa', '0733 907 221', 'P.O. Box 88, Mumias', 18400, 45, false],
    ['Ebusiratsi Primary School', 'Mr. Odhiambo', '0701 552 118', 'P.O. Box 12, Luanda', 0, 30, true],
    ['Nangili Teachers College', 'Procurement Office', '0745 220 761', 'P.O. Box 301, Kakamega', 0, 60, true],
  ];
  const supplyItems = catalogue.slice(0, 14);
  let invoiceSeq = 0;
  let dnSeq = 0;

  for (const [name, contact, phone, address, opening, terms, chargeVat] of schools) {
    const customer = await prisma.customer.create({
      data: {
        name, contactPerson: contact, phone, address,
        type: name.includes('College') ? 'INSTITUTION' : 'SCHOOL',
        openingBalance: opening,
        openingBalanceDate: opening > 0 ? daysAgo(210) : null,
        paymentTermsDays: terms,
        chargeVat,
        kraPin: `P0${int(10000000, 99999999)}X`,
      },
    });

    // Two or three supply runs each, spread over the term.
    const runs = int(2, 3);
    let owed = opening;
    for (let r = 0; r < runs; r++) {
      const ago = [72, 44, 16][r] ?? 16;
      const issued = daysAgo(ago, 10, int(0, 59));
      const lines = [];
      for (let l = 0; l < int(2, 4); l++) {
        const book = pick(supplyItems);
        if (lines.some((x) => x.bookId === book.id)) continue;
        const qty = int(4, 40);
        const price = Number(book.priceSchool ?? book.unitPrice);
        // Printed books are zero-rated; everything else takes the product's rate.
        const rate = chargeVat ? Number(book.vatRate) : 0;
        const net = round2(qty * price);
        const vat = round2(net * (rate / 100));
        lines.push({
          bookId: book.id,
          description: book.title,
          unit: book.unit,
          quantity: qty,
          unitPrice: price,
          vatRate: rate,
          netAmount: net,
          vatAmount: vat,
          total: round2(net + vat),
          sortOrder: lines.length,
        });
      }
      if (lines.length === 0) continue;

      const subtotal = round2(lines.reduce((s, l) => s + l.netAmount, 0));
      const vatTotal = round2(lines.reduce((s, l) => s + l.vatAmount, 0));
      const total = round2(subtotal + vatTotal);
      const delivered = r < runs - 1;

      invoiceSeq += 1;
      dnSeq += 1;
      const inv = await prisma.invoice.create({
        data: {
          number: `INV-${String(invoiceSeq).padStart(4, '0')}`,
          deliveryNoteNo: `DN-${String(dnSeq).padStart(4, '0')}`,
          customerId: customer.id,
          branchId: pick([luanda.id, kapsabet.id, mumias.id]),
          status: delivered ? 'DELIVERED' : 'ISSUED',
          priceTier: 'SCHOOL',
          chargeVat,
          issueDate: issued,
          dueDate: new Date(issued.getTime() + terms * 864e5),
          deliveredAt: delivered ? new Date(issued.getTime() + 2 * 864e5) : null,
          receivedBy: delivered ? contact : null,
          receivedDesignation: delivered ? 'Bursar' : null,
          subtotal, vatTotal, total,
          createdById: manager.id,
          items: { create: lines },
        },
      });
      owed += total;

      // Most schools pay something; a couple deliberately fall behind.
      if (r === 0 && opening > 0) {
        await prisma.customerPayment.create({
          data: { customerId: customer.id, amount: opening, paidAt: daysAgo(ago - 8, 11), method: 'BANK_TRANSFER', reference: 'TRANSFER', createdById: admin.id },
        });
        owed -= opening;
      }
      if (delivered && chance(0.7)) {
        const part = round2(total * pick([0.4, 0.6, 1]));
        await prisma.customerPayment.create({
          data: {
            customerId: customer.id,
            invoiceId: inv.id,
            amount: part,
            paidAt: daysAgo(Math.max(1, ago - 20), 14),
            method: pick(['BANK_TRANSFER', 'CHEQUE', 'MPESA'] as const),
            reference: pick(['TRANSFER', `CHQ${int(1000, 9999)}`, `S${int(100000, 999999)}`]),
            createdById: admin.id,
          },
        });
        owed -= part;
        if (part >= total - 0.01) await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PAID' } });
      }
    }
  }
  console.log(`Added ${schools.length} credit customers with invoices and payments.`);

  /* 10. Suppliers we buy from on credit, with received deliveries. */
  const vendors: Array<[string, string, string, number, number]> = [
    ['Queenex Publishers Limited', 'Sales Desk', 'P. O. Box 56049, Nairobi 00200', 58746, 30],
    ['Kenya Literature Bureau', 'Mr. Mwangi', 'P. O. Box 30022, Nairobi', 0, 45],
    ['Text Book Centre', 'Trade Counter', 'Kijabe Street, Nairobi', 24300, 30],
    ['Centropen Stationers', 'Ms. Achieng', 'Industrial Area, Nairobi', 0, 30],
  ];
  let grnSeq = 0;
  for (const [name, contact, address, opening, terms] of vendors) {
    const supplier = await prisma.supplier.create({
      data: {
        name, contactPerson: contact, address,
        phone: `020${int(1000000, 9999999)}`,
        kraPin: `P0${int(10000000, 99999999)}Z`,
        openingBalance: opening,
        openingBalanceDate: opening > 0 ? daysAgo(180) : null,
        paymentTermsDays: terms,
      },
    });

    for (let r = 0; r < int(2, 3); r++) {
      const ago = [58, 33, 12][r] ?? 12;
      const when = daysAgo(ago, 9, int(0, 59));
      const lines = [];
      for (let l = 0; l < int(3, 6); l++) {
        const book = pick(catalogue);
        if (lines.some((x) => x.bookId === book.id)) continue;
        const qty = int(20, 120);
        const cost = Number(book.costPrice) || 100;
        lines.push({
          bookId: book.id,
          description: book.title,
          unit: book.unit,
          quantity: qty,
          unitCost: cost,
          total: round2(qty * cost),
          sortOrder: lines.length,
        });
      }
      if (lines.length === 0) continue;
      const totalCost = round2(lines.reduce((s, l) => s + l.total, 0));

      grnSeq += 1;
      const grn = await prisma.goodsReceipt.create({
        data: {
          number: `GRN-${String(grnSeq).padStart(4, '0')}`,
          supplierId: supplier.id,
          branchId: pick([luanda.id, kapsabet.id, mumias.id]),
          deliveryNoteNo: `${int(1000, 9999)}`,
          invoiceNo: `${int(38000, 42999)}`,
          receivedAt: when,
          status: 'POSTED',
          postedAt: when,
          postedById: manager.id,
          createdById: manager.id,
          totalCost,
          items: { create: lines },
        },
      });

      // Stock arrived, so record it the same way posting the receipt would.
      for (const l of lines) {
        await prisma.stock.upsert({
          where: { branchId_bookId: { branchId: grn.branchId, bookId: l.bookId } },
          create: { branchId: grn.branchId, bookId: l.bookId, quantity: l.quantity },
          update: { quantity: { increment: l.quantity } },
        });
        await prisma.stockMovement.create({
          data: {
            branchId: grn.branchId, bookId: l.bookId, delta: l.quantity, type: StockMoveType.INTAKE,
            note: `${grn.number} · ${name}`, userId: manager.id, originBranchId: grn.branchId, createdAt: when,
          },
        });
      }

      if (chance(0.7)) {
        await prisma.supplierPayment.create({
          data: {
            supplierId: supplier.id,
            receiptId: grn.id,
            amount: round2(totalCost * pick([0.5, 0.75, 1])),
            paidAt: daysAgo(Math.max(1, ago - 15), 15),
            method: 'BANK_TRANSFER',
            reference: 'TRANSFER',
            createdById: admin.id,
          },
        });
      }
    }
    if (opening > 0) {
      await prisma.supplierPayment.create({
        data: { supplierId: supplier.id, amount: round2(opening * 0.6), paidAt: daysAgo(90, 12), method: 'BANK_TRANSFER', reference: 'TRANSFER', createdById: admin.id },
      });
    }
  }
  console.log(`Added ${vendors.length} suppliers with goods receipts and payments.`);

  console.log('\nDemo data ready. Extra login: manager@booklabbookshop.co.ke (password as supplied).');
  console.log('Run a payroll for last month in the app to see it post to the P&L.');
}

const run = process.argv.includes('--clear') ? clearAll : main;
run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
