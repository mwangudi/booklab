/**
 * Kenyan payroll calculation.
 *
 * Order of operations (PAYE Act as amended by the Tax Laws (Amendment) Act 2024):
 *   gross        = basic + allowances
 *   NSSF         = 6% of pensionable pay, Tier I then Tier II, each capped
 *   SHIF         = 2.75% of gross, subject to a monthly minimum
 *   Housing levy = 1.5% of gross
 *   taxable pay  = gross − NSSF − SHIF − housing levy   (all three are allowable deductions)
 *   PAYE         = banded tax on taxable pay − personal relief − insurance relief   (never below 0)
 *   net pay      = gross − (NSSF + SHIF + housing levy + PAYE + other deductions)
 *
 * Every rate is supplied by the caller from `PayrollSetting`, so statutory
 * changes are a settings edit rather than a code release.
 */

export interface PayeBand {
  /** Upper bound of the band; `null` means "and above". */
  upTo: number | null;
  rate: number;
}

export interface PayrollRates {
  payeBands: PayeBand[];
  personalRelief: number;
  insuranceRelief: number;
  nssfTier1Limit: number;
  nssfTier2Limit: number;
  nssfRate: number;
  shifRate: number;
  shifMinimum: number;
  housingLevyRate: number;
}

export interface PayInput {
  basicSalary: number;
  houseAllowance?: number;
  transportAllowance?: number;
  otherAllowance?: number;
  otherDeductions?: number;
}

export interface PayResult {
  basicSalary: number;
  allowances: number;
  grossPay: number;
  nssf: number;
  shif: number;
  housingLevy: number;
  taxablePay: number;
  paye: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerNssf: number;
  employerHousingLevy: number;
}

/** Money is rounded to whole cents to keep totals reconcilable. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const DEFAULT_PAYE_BANDS: PayeBand[] = [
  { upTo: 24000, rate: 0.1 },
  { upTo: 32333, rate: 0.25 },
  { upTo: 500000, rate: 0.3 },
  { upTo: 800000, rate: 0.325 },
  { upTo: null, rate: 0.35 },
];

/** Progressive tax across the bands — each rate applies only to its own slice. */
export function taxOnBands(amount: number, bands: PayeBand[]): number {
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

/** NSSF employee contribution: 6% of Tier I, then 6% of Tier II, each capped. */
export function nssfContribution(gross: number, rates: PayrollRates): number {
  const tier1Base = Math.min(gross, rates.nssfTier1Limit);
  const tier2Base = Math.max(0, Math.min(gross, rates.nssfTier2Limit) - rates.nssfTier1Limit);
  return round2((tier1Base + tier2Base) * rates.nssfRate);
}

export function computePay(input: PayInput, rates: PayrollRates): PayResult {
  const basicSalary = Math.max(0, input.basicSalary || 0);
  const allowances = round2(
    Math.max(0, input.houseAllowance || 0) + Math.max(0, input.transportAllowance || 0) + Math.max(0, input.otherAllowance || 0),
  );
  const grossPay = round2(basicSalary + allowances);

  const nssf = nssfContribution(grossPay, rates);
  const shif = grossPay > 0 ? round2(Math.max(grossPay * rates.shifRate, rates.shifMinimum)) : 0;
  const housingLevy = round2(grossPay * rates.housingLevyRate);

  const taxablePay = round2(Math.max(0, grossPay - nssf - shif - housingLevy));
  const grossTax = taxOnBands(taxablePay, rates.payeBands.length ? rates.payeBands : DEFAULT_PAYE_BANDS);
  const paye = round2(Math.max(0, grossTax - rates.personalRelief - rates.insuranceRelief));

  const otherDeductions = Math.max(0, input.otherDeductions || 0);
  const totalDeductions = round2(nssf + shif + housingLevy + paye + otherDeductions);
  const netPay = round2(grossPay - totalDeductions);

  return {
    basicSalary: round2(basicSalary),
    allowances,
    grossPay,
    nssf,
    shif,
    housingLevy,
    taxablePay,
    paye,
    otherDeductions: round2(otherDeductions),
    totalDeductions,
    netPay,
    // The employer matches NSSF and pays its own housing levy on top of gross.
    employerNssf: nssf,
    employerHousingLevy: housingLevy,
  };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const periodLabel = (year: number, month: number): string => `${MONTH_NAMES[month - 1] ?? month} ${year}`;
