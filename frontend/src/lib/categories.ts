// Shared taxonomies used across the catalogue, POS, expenses and reports.

/**
 * Product categories. The shop sells more than books — textbooks, exercise
 * books, story books and general stationery — so the catalogue `category`
 * field doubles as the product type. `author`/`isbn` are only meaningful for
 * the book categories and are optional everywhere else.
 */
export const PRODUCT_CATEGORIES = [
  'Textbook',
  'Exercise Book',
  'Story Book',
  'Novel',
  'Reference',
  'Children',
  'Stationery',
  'Art & Craft',
  'Office Supplies',
  'Lab Equipment',
  'Computers & IT',
  'Magazine',
  'Other',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Categories for which author/ISBN inputs are relevant in the catalogue form. */
export const BOOK_CATEGORIES: ReadonlySet<string> = new Set([
  'Textbook',
  'Story Book',
  'Novel',
  'Reference',
  'Children',
]);

/** Units a product can be sold in — reams of manilla, cartons of books, metres of material. */
export const PRODUCT_UNITS = [
  'Piece',
  'Dozen',
  'Ream',
  'Quire',
  'Carton',
  'Box',
  'Packet',
  'Bundle',
  'Roll',
  'Set',
  'Pair',
  'Metre',
  'Litre',
  'Kilogram',
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const CUSTOMER_TYPES = ['SCHOOL', 'INSTITUTION', 'BUSINESS', 'INDIVIDUAL'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'DELIVERED', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_CHANNELS = ['CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CARD'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const EXPENSE_CATEGORIES = ['RENT', 'SALARY', 'UTILITIES', 'SUPPLIES', 'MARKETING', 'MISC'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Customer price tiers. Products may set a different price per tier; null falls back to retail. */
export const PRICE_TIERS = ['RETAIL', 'WHOLESALE', 'SCHOOL'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const ROLES = ['ADMIN', 'MANAGER', 'CASHIER'] as const;
export type Role = (typeof ROLES)[number];

export const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
