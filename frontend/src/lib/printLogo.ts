// The shop logo ships on a black field; `logo-print.png` is the knocked-out
// version used on white paper. Fetched once and cached as a data URL so jsPDF
// can embed it synchronously.

export const PRINT_LOGO_URL = '/logo-print.png';
/** Hard black-and-white copy for thermal receipts, which cannot render colour. */
export const PRINT_LOGO_BW_URL = '/logo-bw.png';
/** height / width of logo-print.png */
export const PRINT_LOGO_RATIO = 414 / 600;

let cached: Promise<string | null> | null = null;

/** Resolves to null when the logo can't be fetched, so printing never blocks on it. */
export function loadPrintLogo(): Promise<string | null> {
  cached ??= fetch(PRINT_LOGO_URL)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => null);
  return cached;
}
