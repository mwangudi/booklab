import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Centropen Stationers quotation 1040724 (06/07/2026). `cost` = inc-VAT unit
// price (Total ÷ Qty). Retail (unitPrice) is a placeholder equal to cost until
// selling prices are set — safe because these have no stock yet.
const items = [
  { sku: 'ST00657', title: 'Kangaro Stapler HD 45S', category: 'Office Supplies', cost: 280 },
  { sku: 'ST00798', title: 'Kangaro Staple Remover SRL 45 Red', category: 'Office Supplies', cost: 50 },
  { sku: 'ST00574', title: 'Kangaro Paper Punch Assorted DP 520', category: 'Office Supplies', cost: 275 },
  { sku: 'ST00575', title: 'Kangaro Paper Punch Assorted DP 540', category: 'Office Supplies', cost: 275 },
  { sku: 'ST00576', title: 'Kangaro Paper Punch Assorted DP 700', category: 'Office Supplies', cost: 720 },
  { sku: 'ST02702', title: 'Luxor Inkglide Pen 0.7mm Black (20 pack)', category: 'Stationery', cost: 295 },
  { sku: 'ST02089', title: 'Luxor Inkglide Pen 1.0mm Blue (25 pack)', category: 'Stationery', cost: 300 },
  { sku: 'ST01891', title: 'Luxor Refillable Permanent Marker Chisel', category: 'Stationery', cost: 520 },
  { sku: 'ST01887', title: 'Luxor Refillable Whiteboard Marker Chisel', category: 'Stationery', cost: 520 },
  { sku: 'ST01119', title: 'Luxor Eco Textliter Orange (dozen)', category: 'Stationery', cost: 420 },
  { sku: 'ST04041', title: 'Nucleus Modelling Clay 500gms', category: 'Art & Craft', cost: 155 },
  { sku: 'ST01285', title: 'Til Spring File PVC', category: 'Office Supplies', cost: 45 },
];

async function main() {
  for (const it of items) {
    await prisma.book.upsert({
      where: { sku: it.sku },
      update: { costPrice: it.cost, category: it.category },
      create: { sku: it.sku, title: it.title, category: it.category, costPrice: it.cost, unitPrice: it.cost },
    });
  }
  const count = await prisma.book.count();
  console.log(`Imported/updated ${items.length} Centropen items. Catalogue now has ${count} products.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
