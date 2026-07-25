import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Report exports: CSV download and a real (jsPDF) PDF download, branded for Booklab Bookshop.

const BRAND = 'Booklab Bookshop';
const BRAND_RGB: [number, number, number] = [180, 83, 9]; // #b45309 burnt amber

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const csvEscape = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const lines = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export type PrintSection = {
  heading: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  /** Column indexes (0-based) to right-align (numbers/currency). */
  numeric?: number[];
};

/** Generates and downloads a branded PDF report using jsPDF + autotable. */
export function downloadPdfReport(opts: { title: string; meta?: string[]; sections: PrintSection[]; filename?: string }): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 48;

  // Brand header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BRAND_RGB);
  doc.text(BRAND, marginX, y);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(opts.title, pageWidth - marginX, y, { align: 'right' });
  y += 10;
  doc.setDrawColor(...BRAND_RGB);
  doc.setLineWidth(1.2);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 18;

  // Meta lines
  if (opts.meta?.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    for (const m of opts.meta) {
      doc.text(m, marginX, y);
      y += 12;
    }
    y += 6;
  }

  // Sections
  for (const s of opts.sections) {
    if (y > pageHeight - 90) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(154, 52, 18);
    doc.text(s.heading, marginX, y);
    y += 6;

    const numeric = new Set(s.numeric ?? []);
    const columnStyles: Record<number, { halign: 'right' }> = {};
    for (const i of numeric) columnStyles[i] = { halign: 'right' };

    autoTable(doc, {
      startY: y + 4,
      head: [s.headers],
      body: s.rows.length
        ? s.rows.map((r) => r.map((c) => String(c)))
        : [[{ content: 'No records', colSpan: s.headers.length, styles: { halign: 'center', textColor: 150 } } as unknown as string]],
      margin: { left: marginX, right: marginX },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold' },
      columnStyles,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  // Footer with page numbers on every page
  const pageCount = doc.getNumberOfPages();
  const stamp = `Generated ${new Date().toLocaleString('en-KE')}`;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${BRAND} · ${stamp}`, marginX, pageHeight - 18);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - marginX, pageHeight - 18, { align: 'right' });
  }

  const filename = opts.filename ?? `${opts.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  doc.save(filename);
}
