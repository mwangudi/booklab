import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { Invoice, Statement, SupplierStatement } from '../types';
import { num } from './format';
import { PRINT_LOGO_RATIO, loadPrintLogo } from './printLogo';

// Invoice, delivery note and customer statement, laid out to match the
// templates the shop already issues to schools.

const BRAND = 'BOOKLAB BOOKSHOP';
const BRAND_RGB: [number, number, number] = [180, 83, 9];
// Printed documents are read off a counter in poor light and photocopied, so
// text is set in black rather than the soft greys jsPDF and autoTable default to.
const TEXT_RGB: [number, number, number] = [0, 0, 0];
// Table rules pick up the brand brown instead of a neutral grey.
const RULE_RGB: [number, number, number] = [180, 83, 9];
const TEL = 'Tel: 0728 492 372';
const KRA_PIN = 'KRA PIN: A003869623J';
const CONTACT = 'Luanda · Kapsabet · Mumias | booklabbookshop.co.ke';

const money = (n: unknown) =>
  num(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A totals row whose label spans the leading columns instead of leaving them blank. */
const totalRow = (label: string, value: string, labelSpan: number): RowInput => [
  { content: label, colSpan: labelSpan, styles: { halign: 'right' } },
  value,
];
const dmy = (iso: string | Date | null | undefined) => {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** Dark brown of the QUOTATION badge on the shop's stationery. */
const BADGE_RGB: [number, number, number] = [122, 46, 14];
// Item rows: tight top/bottom padding so more lines fit per page (headers and totals keep 5).
const ITEM_PAD = { top: 3, bottom: 3, left: 5, right: 5 };

/**
 * Shared letterhead: logo on the left, shop details centred. Returns the y to continue from.
 * With `badge` the title is set in white on a dark-brown rounded panel, as on the quotation.
 */
function header(doc: jsPDF, title: string, logo: string | null, badge = false): number {
  const w = doc.internal.pageSize.getWidth();

  if (logo) {
    const lw = 96;
    doc.addImage(logo, 'PNG', 40, 26, lw, lw * PRINT_LOGO_RATIO);
  }

  // Helvetica offers only normal and bold, which still falls short of the heavy
  // wordmark on the printed stationery, so the glyphs are stroked as well as
  // filled to thicken them.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...BRAND_RGB);
  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(0.7);
  doc.text(BRAND, w / 2, 54, { align: 'center', renderingMode: 'fillThenStroke' });

  doc.setFontSize(14);
  doc.setTextColor(...TEXT_RGB);
  doc.text(TEL, w / 2, 72, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  doc.text(KRA_PIN, w / 2, 87, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(...TEXT_RGB);
  doc.text(CONTACT, w / 2, 100, { align: 'center' });

  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(1.2);
  doc.line(40, 110, w - 40, 110);

  doc.setFont('helvetica', 'bold');
  if (badge) {
    doc.setFontSize(18);
    const tw = doc.getTextWidth(title);
    const bw = tw + 36;
    const bh = 30;
    doc.setFillColor(...BADGE_RGB);
    doc.roundedRect(w / 2 - bw / 2, 118, bw, bh, 7, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(title, w / 2, 139, { align: 'center' });
    doc.setTextColor(...TEXT_RGB);
    return 170;
  }
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_RGB);
  doc.text(title, w / 2, 130, { align: 'center' });
  return 144;
}

/** RECEIVED BY / SCHOOL STAMP / ID NO / DESIGNATION block. */
function signatureBlock(doc: jsPDF, y: number, inv?: Invoice) {
  const w = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let top = Math.max(y + 18, pageH - 150);
  if (top > pageH - 110) {
    doc.addPage();
    top = 120;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  doc.text('RECEIVED BY', 40, top);
  // The stamp box sits at the far right margin.
  const stampX = w - 40 - 170;
  doc.text('SCHOOL STAMP', stampX, top);

  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.6);
  const line = (label: string, value: string | null | undefined, ly: number) => {
    doc.line(40, ly, 280, ly);
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_RGB);
    doc.text(label, 40, ly + 11);
    if (value) {
      doc.setFontSize(10);
      doc.setTextColor(...TEXT_RGB);
      doc.text(value, 44, ly - 4);
    }
  };
  line('', inv?.receivedBy, top + 26);
  line('ID NO.', inv?.receivedIdNo, top + 52);
  line('DESIGNATION', inv?.receivedDesignation, top + 78);

  // Stamp box
  doc.setDrawColor(190, 190, 190);
  doc.rect(stampX, top + 8, 170, 80);
}

/** Tax invoice: description, quantity, unit, unit cost and line total. */
export async function printInvoice(inv: Invoice): Promise<void> {
  const logo = await loadPrintLogo();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, 'INVOICE', logo);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_RGB);
  doc.text(`INV NO: ${inv.number}`, 40, y);
  doc.text(`DATE: ${dmy(inv.issueDate)}`, w - 40, y, { align: 'right' });
  y += 16;
  if (inv.dueDate) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_RGB);
    doc.text(`Due: ${dmy(inv.dueDate)}`, w - 40, y, { align: 'right' });
  }

  // Customer name, prominent and centred (below the due date when there is one).
  if (inv.dueDate) y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  const nameLines = doc.splitTextToSize((inv.customer?.name ?? '').toUpperCase(), w - 80) as string[];
  doc.text(nameLines, w / 2, y + 4, { align: 'center' });
  y += 12 + (nameLines.length - 1) * 14;
  // The contact person is for the shop's records, not printed on the invoice.
  const meta = [inv.customer?.phone, inv.customer?.address].filter(Boolean).join(' · ');
  if (meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_RGB);
    const metaLines = doc.splitTextToSize(meta, w - 80) as string[];
    doc.text(metaLines, w / 2, y + 12, { align: 'center' });
    y += 12 + (metaLines.length - 1) * 11;
  }

  const vatShown = inv.chargeVat && num(inv.vatTotal) > 0;
  // No row-number column: the lines are listed as they were entered.
  const head = vatShown
    ? [['ITEM DESCRIPTION', 'QTTY', 'UNIT', 'UNIT COST', 'VAT %', 'TOTAL']]
    : [['ITEM DESCRIPTION', 'QTTY', 'UNIT', 'UNIT COST', 'TOTAL']];
  const body = (inv.items ?? []).map((i) =>
    vatShown
      ? [i.description, String(num(i.quantity)), i.unit, money(i.unitPrice), `${num(i.vatRate)}%`, money(i.total)]
      : [i.description, String(num(i.quantity)), i.unit, money(i.unitPrice), money(i.total)],
  );
  const cols: Record<number, { halign?: 'right' | 'center'; cellWidth: number }> = vatShown
    ? { 1: { halign: 'center', cellWidth: 42 }, 2: { cellWidth: 52 }, 3: { halign: 'right', cellWidth: 62 }, 4: { halign: 'right', cellWidth: 44 }, 5: { halign: 'right', cellWidth: 72 } }
    : { 1: { halign: 'center', cellWidth: 45 }, 2: { cellWidth: 60 }, 3: { halign: 'right', cellWidth: 70 }, 4: { halign: 'right', cellWidth: 80 } };

  // The totals label spans every column ahead of the value.
  const span = vatShown ? 5 : 4;
  const foot: RowInput[] = [];
  if (vatShown) {
    foot.push(totalRow('SUBTOTAL', money(inv.subtotal), span));
    foot.push(totalRow('VAT', money(inv.vatTotal), span));
  }
  foot.push(totalRow('TOTAL', money(inv.total), span));

  autoTable(doc, {
    startY: y + 14,
    head,
    body,
    margin: { left: 40, right: 40 },
    rowPageBreak: 'avoid',
    styles: { fontSize: 9, cellPadding: ITEM_PAD, textColor: TEXT_RGB, lineColor: RULE_RGB, lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold', cellPadding: 5 },
    columnStyles: cols,
    foot,
    showFoot: 'lastPage',
    footStyles: { fillColor: [245, 245, 245], textColor: TEXT_RGB, fontStyle: 'bold', halign: 'right', cellPadding: 5 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_RGB);
  if (inv.chargeVat && inv.vatMode === 'INCLUSIVE') {
    doc.text('Prices shown are inclusive of VAT.', 40, y + 14);
    y += 10;
  }
  // Invoice notes are for the shop's records and are not printed.
  signatureBlock(doc, y, inv);
  doc.save(`invoice-${inv.number}.pdf`);
}

/** Delivery note: description and quantity only — never prices. */
export async function printDeliveryNote(inv: Invoice): Promise<void> {
  const logo = await loadPrintLogo();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, 'DELIVERY NOTE', logo);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_RGB);
  doc.text(`NO: ${inv.deliveryNoteNo ?? inv.number}`, 40, y);
  doc.text(`DATE: ${dmy(inv.deliveredAt ?? inv.issueDate)}`, w - 40, y, { align: 'right' });
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  const nameLines = doc.splitTextToSize((inv.customer?.name ?? '').toUpperCase(), w - 80) as string[];
  doc.text(nameLines, w / 2, y + 4, { align: 'center' });
  y += 12 + (nameLines.length - 1) * 14;
  if (inv.customer?.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_RGB);
    const addrLines = doc.splitTextToSize(inv.customer.address, w - 80) as string[];
    doc.text(addrLines, w / 2, y + 12, { align: 'center' });
    y += 12 + (addrLines.length - 1) * 11;
  }

  autoTable(doc, {
    startY: y + 14,
    head: [['#', 'ITEM DESCRIPTION', 'QTTY', 'UNIT']],
    body: (inv.items ?? []).map((i, n) => [String(n + 1), i.description, String(num(i.quantity)), i.unit]),
    margin: { left: 40, right: 40 },
    rowPageBreak: 'avoid',
    styles: { fontSize: 9, cellPadding: ITEM_PAD, textColor: TEXT_RGB, lineColor: RULE_RGB, lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold', cellPadding: 5 },
    columnStyles: { 0: { halign: 'center', cellWidth: 26 }, 2: { halign: 'center', cellWidth: 60 }, 3: { cellWidth: 80 } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_RGB);
  doc.text('Goods received in good order and condition.', 40, y + 16);
  signatureBlock(doc, y + 10, inv);
  doc.save(`delivery-note-${inv.deliveryNoteNo ?? inv.number}.pdf`);
}

/** Customer statement with ageing summary and a running balance. */
export async function printStatement(s: Statement): Promise<void> {
  const logo = await loadPrintLogo();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, 'STATEMENT OF ACCOUNT', logo);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  doc.text('TO:', 40, y);
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  doc.text(s.customer.name.toUpperCase(), 40, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  const lines = [s.customer.contactPerson, s.customer.address, s.customer.phone].filter(Boolean) as string[];
  lines.forEach((l, i) => doc.text(l, 40, y + 32 + i * 12));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  doc.text(`Date: ${dmy(s.period.to)}`, w - 40, y, { align: 'right' });
  doc.text(`Period: ${dmy(s.period.from)} — ${dmy(s.period.to)}`, w - 40, y + 14, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_RGB);
  doc.text('AMOUNT DUE', w - 40, y + 38, { align: 'right' });
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_RGB);
  doc.text(`KES ${money(s.amountDue)}`, w - 40, y + 56, { align: 'right' });

  y += 76;

  autoTable(doc, {
    startY: y,
    head: [['CURRENT', '1-30 DAYS', '31-60 DAYS', '61-90 DAYS', 'OVER 90 DAYS', 'AMOUNT DUE']],
    body: [[
      money(s.ageing.current), money(s.ageing.d1_30), money(s.ageing.d31_60),
      money(s.ageing.d61_90), money(s.ageing.over90), money(s.amountDue),
    ]],
    margin: { left: 40, right: 40 },
    styles: { fontSize: 8, cellPadding: 5, halign: 'right', textColor: TEXT_RGB, lineColor: RULE_RGB, lineWidth: 0.4 },
    headStyles: { fillColor: [245, 245, 245], textColor: TEXT_RGB, fontStyle: 'bold', halign: 'right', fontSize: 7 },
    bodyStyles: { fontStyle: 'bold' },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  autoTable(doc, {
    startY: y,
    head: [['DATE', 'TRANSACTION', 'AMOUNT', 'BALANCE']],
    body: [
      [dmy(s.period.from), 'Balance forward', '', money(s.openingBalance)],
      ...s.rows.map((r) => [dmy(r.date), r.label, money(Math.abs(r.amount)) + (r.amount < 0 ? ' CR' : ''), money(r.balance)]),
    ],
    margin: { left: 40, right: 40 },
    styles: { fontSize: 9, cellPadding: 5, textColor: TEXT_RGB, lineColor: RULE_RGB, lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 75 }, 2: { halign: 'right', cellWidth: 90 }, 3: { halign: 'right', cellWidth: 90 } },
    foot: [totalRow('CLOSING BALANCE', money(s.closingBalance), 3)],
    footStyles: { fillColor: [245, 245, 245], textColor: TEXT_RGB, fontStyle: 'bold', halign: 'right' },
  });

  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_RGB);
    doc.text(`${BRAND} · statement generated ${dmy(new Date())}`, 40, pageH - 24);
    doc.text(`Page ${i} / ${pages}`, w - 40, pageH - 24, { align: 'right' });
  }
  doc.save(`statement-${s.customer.name.replace(/\s+/g, '-').toLowerCase()}-${dmy(s.period.to).replace(/\//g, '-')}.pdf`);
}

/** Supplier statement — what we owe them. Mirrors the customer statement so the
 *  two can be reconciled against each other line by line. */
export async function printSupplierStatement(s: SupplierStatement): Promise<void> {
  const logo = await loadPrintLogo();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, "SUPPLIER STATEMENT (RECONCILIATION)", logo);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  doc.text("SUPPLIER:", 40, y);
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  doc.text(s.supplier.name.toUpperCase(), 40, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  const lines = [s.supplier.contactPerson, s.supplier.address, s.supplier.phone].filter(Boolean) as string[];
  lines.forEach((l, i) => doc.text(l, 40, y + 32 + i * 12));

  doc.setFontSize(9);
  doc.setTextColor(...TEXT_RGB);
  doc.text(`Date: ${dmy(s.period.to)}`, w - 40, y, { align: "right" });
  doc.text(`Period: ${dmy(s.period.from)} - ${dmy(s.period.to)}`, w - 40, y + 14, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_RGB);
  doc.text("BALANCE OWED", w - 40, y + 38, { align: "right" });
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_RGB);
  doc.text(`KES ${money(s.amountDue)}`, w - 40, y + 56, { align: "right" });

  y += 76;

  autoTable(doc, {
    startY: y,
    head: [["CURRENT", "1-30 DAYS", "31-60 DAYS", "61-90 DAYS", "OVER 90 DAYS", "BALANCE"]],
    body: [[
      money(s.ageing.current), money(s.ageing.d1_30), money(s.ageing.d31_60),
      money(s.ageing.d61_90), money(s.ageing.over90), money(s.amountDue),
    ]],
    margin: { left: 40, right: 40 },
    styles: { fontSize: 8, cellPadding: 5, halign: "right", textColor: TEXT_RGB, lineColor: RULE_RGB, lineWidth: 0.4 },
    headStyles: { fillColor: [245, 245, 245], textColor: TEXT_RGB, fontStyle: "bold", halign: "right", fontSize: 7 },
    bodyStyles: { fontStyle: "bold" },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  autoTable(doc, {
    startY: y,
    head: [["DATE", "TRANSACTION", "AMOUNT", "BALANCE"]],
    body: [
      [dmy(s.period.from), "Balance forward", "", money(s.openingBalance)],
      ...s.rows.map((r) => [dmy(r.date), r.label, money(Math.abs(r.amount)) + (r.amount < 0 ? " DR" : ""), money(r.balance)]),
    ],
    margin: { left: 40, right: 40 },
    styles: { fontSize: 9, cellPadding: 5, textColor: TEXT_RGB, lineColor: RULE_RGB, lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 75 }, 2: { halign: "right", cellWidth: 90 }, 3: { halign: "right", cellWidth: 90 } },
    foot: [totalRow("CLOSING BALANCE", money(s.closingBalance), 3)],
    footStyles: { fillColor: [245, 245, 245], textColor: TEXT_RGB, fontStyle: "bold", halign: "right" },
  });

  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_RGB);
    doc.text(`${BRAND} - supplier reconciliation ${dmy(new Date())}`, 40, pageH - 24);
    doc.text(`Page ${i} / ${pages}`, w - 40, pageH - 24, { align: "right" });
  }
  doc.save(`supplier-statement-${s.supplier.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}


/** What a quotation prints: the invoice editor's current lines, numbered after its invoice. */
export interface QuotationInput {
  number: string;
  date: string;
  /** Days the prices hold; printed as a "valid until" date. */
  validDays: number;
  customer: { name: string; phone?: string | null; address?: string | null };
  chargeVat: boolean;
  vatMode: 'EXCLUSIVE' | 'INCLUSIVE';
  items: Array<{ description: string; quantity: number; unit: string; unitPrice: number; vatRate: number; total: number }>;
  subtotal: number;
  vatTotal: number;
  total: number;
  preparedBy?: string | null;
}

/**
 * A quotation to send a customer before they order: the same letterhead with a dark-brown
 * QUOTATION badge, the items and totals, how long the prices hold, and a place for the
 * customer to accept. Returns the PDF so the page can download it or share it.
 */
export async function buildQuotation(q: QuotationInput): Promise<{ blob: Blob; fileName: string }> {
  const logo = await loadPrintLogo();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, 'QUOTATION', logo, true);

  // "2026-11-20" read as a local date (not UTC midnight), so no timezone shifts it a day.
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date.split('-').map(Number) : null;
  const now = new Date();
  const issued = ymd ? new Date(ymd[0], ymd[1] - 1, ymd[2]) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const valid = new Date(issued.getFullYear(), issued.getMonth(), issued.getDate() + q.validDays);
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_RGB);
  doc.text(`QUOTE NO: ${q.number}`, 40, y);
  doc.text(`DATE: ${dmy(issued)}`, w - 40, y, { align: 'right' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Valid until: ${dmy(valid)}`, w - 40, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('TO:', 40, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  const nameLines = doc.splitTextToSize(q.customer.name.toUpperCase(), w - 80) as string[];
  doc.text(nameLines, w / 2, y + 15, { align: 'center' });
  y += 15 + (nameLines.length - 1) * 14;
  const meta = [q.customer.phone, q.customer.address].filter(Boolean).join(' · ');
  if (meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_RGB);
    const metaLines = doc.splitTextToSize(meta, w - 80) as string[];
    doc.text(metaLines, w / 2, y + 13, { align: 'center' });
    y += 13 + (metaLines.length - 1) * 11;
  }

  const vatShown = q.chargeVat && q.vatTotal > 0;
  const head = vatShown
    ? [['ITEM DESCRIPTION', 'QTTY', 'UNIT', 'UNIT PRICE', 'VAT %', 'TOTAL']]
    : [['ITEM DESCRIPTION', 'QTTY', 'UNIT', 'UNIT PRICE', 'TOTAL']];
  const body = q.items.map((i) =>
    vatShown
      ? [i.description, String(i.quantity), i.unit, money(i.unitPrice), `${i.vatRate}%`, money(i.total)]
      : [i.description, String(i.quantity), i.unit, money(i.unitPrice), money(i.total)],
  );
  const cols: Record<number, { halign?: 'right' | 'center'; cellWidth: number }> = vatShown
    ? { 1: { halign: 'center', cellWidth: 42 }, 2: { cellWidth: 52 }, 3: { halign: 'right', cellWidth: 66 }, 4: { halign: 'right', cellWidth: 44 }, 5: { halign: 'right', cellWidth: 72 } }
    : { 1: { halign: 'center', cellWidth: 45 }, 2: { cellWidth: 60 }, 3: { halign: 'right', cellWidth: 72 }, 4: { halign: 'right', cellWidth: 80 } };
  const span = vatShown ? 5 : 4;
  const foot: RowInput[] = [];
  if (vatShown) {
    foot.push(totalRow('SUBTOTAL', money(q.subtotal), span));
    foot.push(totalRow('VAT', money(q.vatTotal), span));
  }
  foot.push(totalRow('TOTAL', money(q.total), span));

  autoTable(doc, {
    startY: y + 16,
    head,
    body,
    margin: { left: 40, right: 40 },
    rowPageBreak: 'avoid',
    styles: { fontSize: 9, cellPadding: ITEM_PAD, textColor: TEXT_RGB, lineColor: RULE_RGB, lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold', cellPadding: 5 },
    columnStyles: cols,
    foot,
    showFoot: 'lastPage',
    footStyles: { fillColor: [245, 245, 245], textColor: TEXT_RGB, fontStyle: 'bold', halign: 'right', cellPadding: 5 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_RGB);
  const terms = [
    `This quotation is valid until ${dmy(valid)}.`,
    !vatShown ? 'No VAT is charged on this quotation.' : q.vatMode === 'INCLUSIVE' ? 'Prices include VAT.' : 'VAT is added as shown.',
    'Items are supplied subject to availability at the time of order.',
    'To accept, sign and stamp below, or reply with your order quoting the quotation number.',
  ];
  for (const t of terms) {
    for (const line of doc.splitTextToSize(`• ${t}`, w - 80) as string[]) {
      // Never past the bottom margin: carry on at the top of a new page.
      if (y > pageH - 50) {
        doc.addPage();
        y = 60;
      }
      doc.text(line, 40, y);
      y += 11;
    }
  }

  // Prepared by (the shop) and accepted by (the customer), with a stamp box.
  let top = Math.max(y + 18, pageH - 150);
  if (top > pageH - 110) {
    doc.addPage();
    top = 120;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PREPARED BY', 40, top);
  doc.text('ACCEPTED BY', 220, top);
  doc.text('SCHOOL STAMP', w - 40 - 150, top);
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.6);
  doc.setFontSize(10);
  if (q.preparedBy) doc.text(q.preparedBy, 44, top + 22);
  doc.line(40, top + 26, 190, top + 26);
  doc.setFontSize(8);
  doc.text('For Booklab Bookshop', 40, top + 37);
  doc.line(220, top + 26, 370, top + 26);
  doc.text('Name and signature', 220, top + 37);
  doc.line(220, top + 62, 370, top + 62);
  doc.text('Date', 220, top + 73);
  doc.setDrawColor(190, 190, 190);
  doc.rect(w - 40 - 150, top + 8, 150, 70);

  const fileName = `quotation-${q.number}.pdf`;
  return { blob: doc.output('blob'), fileName };
}
