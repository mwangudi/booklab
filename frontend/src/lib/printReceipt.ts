// Thermal receipt printing for EPOS terminals: renders into a hidden iframe and
// opens the OS print dialog, so it works with any 58mm/80mm printer that has a
// driver installed (USB, Bluetooth or network).
//
// Reprints are deliberately stamped as duplicates — a copy must never be able to
// pass as an original receipt.

import { getReceiptSettings } from './receiptSettings';
import { PRINT_LOGO_BW_URL } from './printLogo';

export interface ReceiptItem {
  title: string;
  qty: number;
  unitPrice: number;
}

export interface ReceiptData {
  receiptNo: string | number;
  dateTime: string;
  branchName?: string;
  branchLocation?: string;
  cashier?: string;
  paymentMethod: string;
  mpesaRef?: string | null;
  items: ReceiptItem[];
  /** Lines total before any discount; omit when nothing was discounted. */
  subtotal?: number;
  discount?: number;
  total: number;
  cashGiven?: number | null;
  change?: number | null;
  footer?: string;
  /** 0 or undefined = original. 1+ prints a DUPLICATE banner with the copy number. */
  copy?: number;
  /** Stamps the receipt as cancelled so a voided sale can never be used as proof of purchase. */
  voided?: boolean;
  /** Who asked for the reprint, shown on duplicates for accountability. */
  reprintedBy?: string;
  reprintedAt?: string;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

const money = (n: number) => 'KES ' + Math.round(n).toLocaleString('en-KE');

const SHOP_TEL = 'Tel: 0728 492 372';

function buildHtml(d: ReceiptData): string {
  const cfg = getReceiptSettings();
  const paper = cfg.paperWidth;
  const body = paper - 6; // allow for the @page margins
  // 58mm rolls fit noticeably fewer characters per line.
  const baseFont = paper === 58 ? 10 : 12;
  const logoW = Math.round(body * 0.28);

  const rows = d.items
    .map(
      (it) =>
        `<div class="item"><div class="name">${esc(it.title)}</div>` +
        `<div class="row"><span>${it.qty} x ${money(it.unitPrice)}</span><span>${money(it.qty * it.unitPrice)}</span></div></div>`,
    )
    .join('');

  const mpesaBlock = d.mpesaRef ? `<div class="row"><span>M-Pesa Ref</span><span>${esc(d.mpesaRef)}</span></div>` : '';
  const cashBlock =
    d.paymentMethod === 'CASH' && d.cashGiven
      ? `<div class="row"><span>Cash</span><span>${money(d.cashGiven)}</span></div>` +
        `<div class="row"><span>Change</span><span>${money(d.change ?? 0)}</span></div>`
      : '';

  const discountBlock =
    d.discount && d.discount > 0
      ? `<div class="row"><span>Subtotal</span><span>${money(d.subtotal ?? d.total + d.discount)}</span></div>` +
        `<div class="row"><span>Discount</span><span>-${money(d.discount)}</span></div>`
      : '';

  const isCopy = (d.copy ?? 0) > 0;
  const dupBanner = isCopy
    ? `<div class="stamp">*** DUPLICATE ***</div>
       <div class="center muted">Reprint copy #${d.copy}${d.reprintedBy ? ` &middot; ${esc(d.reprintedBy)}` : ''}</div>
       ${d.reprintedAt ? `<div class="center muted">Reprinted ${esc(d.reprintedAt)}</div>` : ''}
       <div class="hr"></div>`
    : '';

  const voidBanner = d.voided
    ? `<div class="stamp void">*** VOIDED &mdash; NOT A VALID SALE ***</div><div class="hr"></div>`
    : '';

  const extraFooter = cfg.footerNote.trim() ? `<div class="center foot">${esc(cfg.footerNote.trim())}</div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(d.receiptNo)}</title>
  <style>
    @page { size: ${paper}mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { width: ${body}mm; font-family: 'Courier New', ui-monospace, monospace; font-size: ${baseFont}px; color: #000; background: #fff; }
    .center { text-align: center; }
    /* Logo to the left of a centred title, as on the invoice letterhead. */
    .head { display: flex; align-items: center; gap: 2mm; margin-bottom: 3px; }
    .logo { flex: 0 0 ${logoW}mm; width: ${logoW}mm; }
    .headtext { flex: 1 1 auto; min-width: 0; text-align: center; }
    .brand { font-weight: 700; font-size: ${baseFont + 1}px; letter-spacing: 0.3px; }
    .muted { font-size: ${baseFont - 1}px; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin: 3px 0; }
    .name { font-weight: 700; word-break: break-word; }
    .total { font-size: ${baseFont + 2}px; font-weight: 700; margin-top: 2px; }
    .foot { margin-top: 6px; font-size: ${baseFont - 1}px; }
    .stamp { text-align: center; font-weight: 700; font-size: ${baseFont + 1}px; border: 2px solid #000; padding: 3px; margin: 6px 0 4px; }
    .void { border-style: double; }
  </style></head>
  <body>
    <div class="head">
      <img class="logo" src="${PRINT_LOGO_BW_URL}" alt="">
      <div class="headtext">
        <div class="brand">BOOKLAB BOOKSHOP</div>
        <div class="muted">${esc(SHOP_TEL)}</div>
        ${d.branchName ? `<div class="muted">${esc(d.branchName)}${d.branchLocation ? ` &middot; ${esc(d.branchLocation)}` : ''}</div>` : ''}
      </div>
    </div>
    <div class="hr"></div>
    ${voidBanner}
    ${dupBanner}
    <div class="row"><span>Receipt</span><span>#${esc(d.receiptNo)}</span></div>
    <div class="row"><span>Date</span><span>${esc(d.dateTime)}</span></div>
    ${d.cashier ? `<div class="row"><span>Served by</span><span>${esc(d.cashier)}</span></div>` : ''}
    <div class="row"><span>Payment</span><span>${esc(d.paymentMethod)}</span></div>
    ${mpesaBlock}
    <div class="hr"></div>
    ${rows}
    <div class="hr"></div>
    ${discountBlock}
    <div class="row total"><span>TOTAL</span><span>${money(d.total)}</span></div>
    ${cashBlock}
    <div class="hr"></div>
    <div class="center foot">${esc(d.footer ?? 'Thank you for shopping with us!')}</div>
    ${extraFooter}
    <div class="center foot">booklabbookshop.co.ke</div>
  </body></html>`;
}

/** Resolves once every image in the document has settled, so nothing prints half-drawn. */
function imagesReady(doc: Document): Promise<void> {
  const pending = Array.from(doc.images)
    .filter((img) => !img.complete)
    .map((img) => new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); }));
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
}

/** Render the receipt in a hidden iframe and open the print dialog. */
export function printReceipt(data: ReceiptData): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 800);
  };

  iframe.onload = () => {
    const w = iframe.contentWindow;
    if (!w) return cleanup();
    w.onafterprint = cleanup;
    // The logo must be decoded first or the printer emits a blank space where it belongs.
    void imagesReady(w.document).then(() => {
      try {
        w.focus();
        w.print();
      } catch {
        cleanup();
      }
      setTimeout(cleanup, 60_000); // safety net
    });
  };

  const doc = iframe.contentWindow?.document;
  if (!doc) return cleanup();
  doc.open();
  doc.write(buildHtml(data));
  doc.close();
}

/** Preview markup for the settings screen — same renderer, no print dialog. */
export function receiptPreviewHtml(data: ReceiptData): string {
  return buildHtml(data);
}
