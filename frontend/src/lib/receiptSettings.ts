// Printer settings are per-terminal: each till may have a different EPOS printer,
// so these live in this browser's local storage rather than on the server.

const KEY = 'booklab_receipt_settings';

export type PaperWidth = 58 | 80;

export interface ReceiptSettings {
  /** Roll width in millimetres. 80mm is the common desktop EPOS size; 58mm is the compact/mobile size. */
  paperWidth: PaperWidth;
  /** Extra line printed at the bottom, e.g. return policy or PIN. */
  footerNote: string;
  /** Open the print dialog automatically when a sale completes. */
  autoPrint: boolean;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  paperWidth: 80,
  footerNote: '',
  autoPrint: true,
};

export function getReceiptSettings(): ReceiptSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_RECEIPT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReceiptSettings>;
    return {
      paperWidth: parsed.paperWidth === 58 ? 58 : 80,
      footerNote: typeof parsed.footerNote === 'string' ? parsed.footerNote : '',
      autoPrint: parsed.autoPrint !== false,
    };
  } catch {
    return DEFAULT_RECEIPT_SETTINGS;
  }
}

export function saveReceiptSettings(s: ReceiptSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — fall back to defaults */
  }
}
