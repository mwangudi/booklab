import type { PayeBand, PayrollSettings } from '../types';

/**
 * Client-side mirror of the server's payroll maths, used only to preview the
 * effect of a rate change before saving. The server remains the source of truth
 * for anything that is actually paid.
 */
type Rates = Omit<PayrollSettings, 'id'>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function taxOnBands(amount: number, bands: PayeBand[]): number {
  if (amount <= 0) return 0;
  let remaining = amount;
  let lower = 0;
  let tax = 0;
  for (const band of bands) {
    const upper = band.upTo ?? Infinity;
    const slice = Math.min(remaining, upper - lower);
    if (slice > 0) {
      tax += slice * band.rate;
      remaining -= slice;
    }
    lower = upper;
    if (remaining <= 0) break;
  }
  return tax;
}

export function computePayPreview(grossPay: number, r: Rates) {
  const gross = Math.max(0, grossPay);
  const tier1 = Math.min(gross, r.nssfTier1Limit);
  const tier2 = Math.max(0, Math.min(gross, r.nssfTier2Limit) - r.nssfTier1Limit);
  const nssf = round2((tier1 + tier2) * r.nssfRate);
  const shif = gross > 0 ? round2(Math.max(gross * r.shifRate, r.shifMinimum)) : 0;
  const housingLevy = round2(gross * r.housingLevyRate);
  const taxablePay = round2(Math.max(0, gross - nssf - shif - housingLevy));
  const paye = round2(Math.max(0, taxOnBands(taxablePay, r.payeBands) - r.personalRelief - r.insuranceRelief));
  const totalDeductions = round2(nssf + shif + housingLevy + paye);
  return { grossPay: round2(gross), nssf, shif, housingLevy, taxablePay, paye, totalDeductions, netPay: round2(gross - totalDeductions) };
}
