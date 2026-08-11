import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice, Statement, SupplierStatement } from '../types';
import { num } from './format';

// Invoice, delivery note and customer statement, laid out to match the
// templates the shop already issues to schools.

const BRAND = 'BOOKLAB BOOKSHOP';
const BRAND_RGB: [number, number, number] = [180, 83, 9];
const TAGLINE = 'For Quality, For You';
const CONTACT = 'Luanda · Kapsabet · Mumias | 0728 492 372 | booklabbookshop.co.ke';

const money = (n: unknown) => Math.round(num(n)).toLocaleString('en-KE');
const dmy = (iso: string | Date | null | undefined) => {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** Shared letterhead; returns the y position to continue from. */
function header(doc: jsPDF, title: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...BRAND_RGB);
  doc.text(BRAND, w / 2, 52, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(TAGLINE, w / 2, 66, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(CONTACT, w / 2, 78, { align: 'center' });

  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(1.2);
  doc.line(40, 86, w - 40, 86);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(40, 40, 40);
  doc.text(title, w / 2, 106, { align: 'center' });
  return 120;
}

/** RECEIVED BY / SCHOOL STAMP / ID NO / DESIGNATION block. */
function signatureBlock(doc: jsPDF, y: number, inv?: Invoice) {
  const w = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let top = Math.max(y + 24, pageH - 150);
  if (top > pageH - 120) {
    doc.addPage();
    top = 120;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('RECEIVED BY', 40, top);
  doc.text('SCHOOL STAMP', w / 2 + 20, top);

  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.6);
  const line = (label: string, value: string | null | undefined, ly: number) => {
    doc.line(40, ly, 280, ly);
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(label, 40, ly + 11);
    if (value) {
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text(value, 44, ly - 4);
    }
  };
  line('', inv?.receivedBy, top + 26);
  line('ID NO.', inv?.receivedIdNo, top + 52);
  line('DESIGNATION', inv?.receivedDesignation, top + 78);

  // Stamp box
  doc.setDrawColor(190, 190, 190);
  doc.rect(w / 2 + 20, top + 8, 170, 80);
}

/** Tax invoice: description, quantity, unit, unit cost and line total. */
export function printInvoice(inv: Invoice): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, 'INVOICE');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(`INV NO: ${inv.number}`, 40, y);
  doc.text(`DATE: ${dmy(inv.issueDate)}`, w - 40, y, { align: 'right' });
  y += 16;
  if (inv.dueDate) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(`Due: ${dmy(inv.dueDate)}`, w - 40, y, { align: 'right' });
  }

  // Customer name, prominent, as on the template.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  doc.text((inv.customer?.name ?? '').toUpperCase(), 40, y + 4);
  y += 12;
  const meta = [inv.customer?.contactPerson, inv.customer?.phone, inv.customer?.address].filter(Boolean).join(' · ');
  if (meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(meta, 40, y + 12);
    y += 12;
  }

  const vatShown = inv.chargeVat && num(inv.vatTotal) > 0;
  const head = vatShown
    ? [['ITEM DESCRIPTION', 'QTTY', 'UNIT', 'UNIT COST', 'VAT %', 'TOTAL']]
    : [['ITEM DESCRIPTION', 'QTTY', 'UNIT', 'UNIT COST', 'TOTAL']];
  const body = (inv.items ?? []).map((i) =>
    vatShown
      ? [i.description, String(num(i.quantity)), i.unit, money(i.unitPrice), `${num(i.vatRate)}%`, money(i.total)]
      : [i.description, String(num(i.quantity)), i.unit, money(i.unitPrice), money(i.total)],
  );
  const cols: Record<number, { halign?: 'right'; cellWidth: number }> = vatShown
    ? { 1: { halign: 'right', cellWidth: 42 }, 2: { cellWidth: 52 }, 3: { halign: 'right', cellWidth: 62 }, 4: { halign: 'right', cellWidth: 44 }, 5: { halign: 'right', cellWidth: 72 } }
    : { 1: { halign: 'right', cellWidth: 45 }, 2: { cellWidth: 60 }, 3: { halign: 'right', cellWidth: 70 }, 4: { halign: 'right', cellWidth: 80 } };

  const span = vatShown ? 4 : 3;
  const foot: string[][] = [];
  if (vatShown) {
    foot.push([...Array(span).fill(''), 'SUBTOTAL', money(inv.subtotal)]);
    foot.push([...Array(span).fill(''), 'VAT', money(inv.vatTotal)]);
  }
  foot.push([...Array(span).fill(''), 'TOTAL', money(inv.total)]);

  autoTable(doc, {
    startY: y + 14,
    head,
    body,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 9, cellPadding: 5, lineColor: [200, 200, 200], lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold' },
    columnStyles: cols,
    foot,
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  if (!inv.chargeVat) {
    doc.text('VAT not applicable on this account.', 40, y + 14);
    y += 10;
  } else if (inv.vatMode === 'INCLUSIVE') {
    doc.text('Prices shown are inclusive of VAT.', 40, y + 14);
    y += 10;
  }
  if (inv.notes) {
    doc.text(doc.splitTextToSize(inv.notes, w - 80) as string[], 40, y + 16);
    y += 16;
  }
  signatureBlock(doc, y, inv);
  doc.save(`invoice-${inv.number}.pdf`);
}

/** Delivery note: description and quantity only — never prices. */
export function printDeliveryNote(inv: Invoice): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, 'DELIVERY NOTE');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(`NO: ${inv.deliveryNoteNo ?? inv.number}`, 40, y);
  doc.text(`DATE: ${dmy(inv.deliveredAt ?? inv.issueDate)}`, w - 40, y, { align: 'right' });
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  doc.text((inv.customer?.name ?? '').toUpperCase(), 40, y + 4);
  y += 12;
  if (inv.customer?.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(inv.customer.address, 40, y + 12);
    y += 12;
  }

  autoTable(doc, {
    startY: y + 14,
    head: [['ITEM DESCRIPTION', 'QTTY', 'UNIT']],
    body: (inv.items ?? []).map((i) => [i.description, String(num(i.quantity)), i.unit]),
    margin: { left: 40, right: 40 },
    styles: { fontSize: 9, cellPadding: 5, lineColor: [200, 200, 200], lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 60 }, 2: { cellWidth: 80 } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text('Goods received in good order and condition.', 40, y + 16);
  signatureBlock(doc, y + 10, inv);
  doc.save(`delivery-note-${inv.deliveryNoteNo ?? inv.number}.pdf`);
}

/** Customer statement with ageing summary and a running balance. */
export function printStatement(s: Statement): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, 'STATEMENT OF ACCOUNT');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text('TO:', 40, y);
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  doc.text(s.customer.name.toUpperCase(), 40, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  const lines = [s.customer.contactPerson, s.customer.address, s.customer.phone].filter(Boolean) as string[];
  lines.forEach((l, i) => doc.text(l, 40, y + 32 + i * 12));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Date: ${dmy(s.period.to)}`, w - 40, y, { align: 'right' });
  doc.text(`Period: ${dmy(s.period.from)} — ${dmy(s.period.to)}`, w - 40, y + 14, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
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
    styles: { fontSize: 8, cellPadding: 5, halign: 'right', lineColor: [200, 200, 200], lineWidth: 0.4 },
    headStyles: { fillColor: [245, 245, 245], textColor: [90, 90, 90], fontStyle: 'bold', halign: 'right', fontSize: 7 },
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
    styles: { fontSize: 9, cellPadding: 5, lineColor: [210, 210, 210], lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 75 }, 2: { halign: 'right', cellWidth: 90 }, 3: { halign: 'right', cellWidth: 90 } },
    foot: [['', 'CLOSING BALANCE', '', money(s.closingBalance)]],
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'right' },
  });

  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${BRAND} · statement generated ${dmy(new Date())}`, 40, pageH - 24);
    doc.text(`Page ${i} / ${pages}`, w - 40, pageH - 24, { align: 'right' });
  }
  doc.save(`statement-${s.customer.name.replace(/\s+/g, '-').toLowerCase()}-${dmy(s.period.to).replace(/\//g, '-')}.pdf`);
}

/** Supplier statement — what we owe them. Mirrors the customer statement so the
 *  two can be reconciled against each other line by line. */
export function printSupplierStatement(s: SupplierStatement): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let y = header(doc, "SUPPLIER STATEMENT (RECONCILIATION)");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text("SUPPLIER:", 40, y);
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_RGB);
  doc.text(s.supplier.name.toUpperCase(), 40, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  const lines = [s.supplier.contactPerson, s.supplier.address, s.supplier.phone].filter(Boolean) as string[];
  lines.forEach((l, i) => doc.text(l, 40, y + 32 + i * 12));

  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Date: ${dmy(s.period.to)}`, w - 40, y, { align: "right" });
  doc.text(`Period: ${dmy(s.period.from)} - ${dmy(s.period.to)}`, w - 40, y + 14, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
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
    styles: { fontSize: 8, cellPadding: 5, halign: "right", lineColor: [200, 200, 200], lineWidth: 0.4 },
    headStyles: { fillColor: [245, 245, 245], textColor: [90, 90, 90], fontStyle: "bold", halign: "right", fontSize: 7 },
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
    styles: { fontSize: 9, cellPadding: 5, lineColor: [210, 210, 210], lineWidth: 0.4 },
    headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 75 }, 2: { halign: "right", cellWidth: 90 }, 3: { halign: "right", cellWidth: 90 } },
    foot: [["", "CLOSING BALANCE", "", money(s.closingBalance)]],
    footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: "bold", halign: "right" },
  });

  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${BRAND} - supplier reconciliation ${dmy(new Date())}`, 40, pageH - 24);
    doc.text(`Page ${i} / ${pages}`, w - 40, pageH - 24, { align: "right" });
  }
  doc.save(`supplier-statement-${s.supplier.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
