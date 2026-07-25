// API response shapes. Decimal columns arrive as strings over JSON, so numeric
// money/price fields are typed `number | string` and coerced with `num()`.

import type { ExpenseCategory, PaymentMethod, PriceTier, Role } from './lib/categories';

export type Money = number | string;

export interface Branch {
  id: number;
  name: string;
  location: string;
  createdAt?: string;
  uuid?: string;
}

export interface Book {
  id: number;
  title: string;
  author: string | null;
  isbn: string | null;
  sku: string;
  category: string | null;
  unitPrice: Money;
  priceWholesale: Money | null;
  priceSchool: Money | null;
  costPrice: Money;
  /** Set when the product has been archived (soft-deleted). */
  deletedAt?: string | null;
  createdAt?: string;
  uuid?: string;
}

export interface AuditEntry {
  id: number;
  createdAt: string;
  user: string;
  email: string | null;
  role: string | null;
  entity: string;
  entityId: number | null;
  action: string;
  branchId: number | null;
  ip: string | null;
  details: string | null;
}

export type EmploymentType = 'PERMANENT' | 'CONTRACT' | 'CASUAL' | 'INTERN';

export interface Employee {
  id: number;
  staffNo: string;
  firstName: string;
  lastName: string;
  nationalId: string | null;
  kraPin: string | null;
  nssfNo: string | null;
  shifNo: string | null;
  phone: string | null;
  email: string | null;
  jobTitle: string | null;
  employmentType: EmploymentType;
  branchId: number | null;
  userId: number | null;
  basicSalary: Money;
  houseAllowance: Money;
  transportAllowance: Money;
  otherAllowance: Money;
  otherDeductions: Money;
  bankName: string | null;
  bankAccount: string | null;
  hiredAt: string | null;
  active: boolean;
  deletedAt: string | null;
  branch?: { name: string } | null;
  user?: { id: number; name: string; email: string } | null;
}

export interface PayrollRun {
  id: number;
  year: number;
  month: number;
  status: 'DRAFT' | 'CLOSED';
  note: string | null;
  grossTotal: Money;
  deductionsTotal: Money;
  netTotal: Money;
  employerTotal: Money;
  closedAt: string | null;
  createdAt: string;
  _count?: { payslips: number };
  payslips?: Payslip[];
}

export interface Payslip {
  id: number;
  runId: number;
  employeeId: number;
  branchId: number | null;
  basicSalary: Money;
  allowances: Money;
  grossPay: Money;
  nssf: Money;
  shif: Money;
  housingLevy: Money;
  taxablePay: Money;
  paye: Money;
  otherDeductions: Money;
  totalDeductions: Money;
  netPay: Money;
  employerNssf: Money;
  employerHousingLevy: Money;
  employee?: {
    staffNo: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    branch?: { name: string } | null;
  };
}

export interface PayeBand {
  upTo: number | null;
  rate: number;
}

export interface PayrollSettings {
  id: number;
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

export interface Stock {
  id: number;
  branchId: number;
  bookId: number;
  quantity: number;
  /** Optional per-branch selling price override; when null the catalogue price applies. */
  price: Money | null;
  book: Book;
}

export interface BranchValuation {
  branchId: number;
  name: string;
  skuCount: number;
  units: number;
  retailValue: number;
  costValue: number;
  lowCount: number;
  outCount: number;
}

export interface StockValuation {
  totals: Omit<BranchValuation, 'branchId' | 'name'>;
  branches: BranchValuation[];
}

export interface SaleItem {
  id: number;
  bookId: number;
  quantity: number;
  unitPrice: Money;
  costPrice: Money;
  book?: Book;
}

export interface Sale {
  id: number;
  branchId: number;
  userId: number;
  total: Money;
  paymentMethod: PaymentMethod;
  priceTier?: PriceTier;
  mpesaRef: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  voidedBy?: { id: number; name: string } | null;
  reprintCount?: number;
  createdAt: string;
  branch?: Branch;
  user?: { id: number; name: string };
  items: SaleItem[];
}

export type StockMoveType = 'INTAKE' | 'ADJUST' | 'SALE' | 'VOID' | 'TRANSFER_IN' | 'TRANSFER_OUT';

export interface StockMovement {
  id: number;
  createdAt: string;
  branch: string;
  title: string;
  sku: string;
  delta: number;
  type: StockMoveType;
  note: string | null;
  user: string;
}

export interface Expense {
  id: number;
  branchId: number | null;
  category: ExpenseCategory;
  description: string | null;
  amount: Money;
  incurredAt: string;
  branch?: Branch | null;
}

export interface TodayByBranch {
  branchId: number;
  name: string;
  txn: number;
  net: number;
}

export interface PnlReport {
  summary: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    expenses: number;
    netProfit: number;
    netMargin: number;
  };
  byBranch: Array<{ branchId: number | null; name: string; revenue: number; cogs: number; expenses: number; grossProfit: number; netProfit: number }>;
  byCategory: Array<{ category: string; amount: number }>;
}

export interface SalesReport {
  summary: { revenue: number; txns: number; itemsSold: number; avgBasket: number };
  byBranch: Array<{ branchId: number; name: string; txns: number; revenue: number }>;
  rows: Array<{ id: number; date: string; branch: string; cashier: string; payment: string; items: number; total: number }>;
}

export interface StockReport {
  summary: { skuCount: number; units: number; retailValue: number; costValue: number };
  rows: Array<{ branch: string; title: string; sku: string; quantity: number; unitPrice: number; value: number; status: string }>;
}

export interface ZReport {
  date: string;
  branch: string | null;
  summary: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    txns: number;
    itemsSold: number;
    avgBasket: number;
    voidedCount: number;
    voidedAmount: number;
    expenses: number;
    expectedCash: number;
  };
  byMethod: Array<{ method: string; txns: number; amount: number }>;
  byCashier: Array<{ name: string; txns: number; amount: number }>;
  voids: Array<{ id: number; total: number; reason: string | null; by: string; at: string | null }>;
}

export interface LowStockReport {
  threshold: number;
  summary: { skuCount: number; outCount: number; lowCount: number; reorderCost: number };
  rows: Array<{
    branch: string;
    title: string;
    sku: string;
    category: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    suggestedOrder: number;
    status: string;
  }>;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active?: boolean;
  branchId: number | null;
  branch?: { name: string } | null;
  branchName?: string | null;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    role: Role;
    branchId: number | null;
    branchName: string | null;
  };
}
