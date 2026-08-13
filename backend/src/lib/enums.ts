/**
 * Domain enums as plain unions.
 *
 * SQLite has no native enums, so the branch build rewrites every enum column to
 * String and the generated client exports no enum types. Importing them from
 * `@prisma/client` therefore compiles against MySQL but breaks the branch build.
 * These mirror the enums in schema.prisma and work against either client.
 */

export type Role = 'ADMIN' | 'MANAGER' | 'CASHIER';
export type PaymentMethod = 'CASH' | 'MPESA' | 'CARD';
export type PriceTier = 'RETAIL' | 'WHOLESALE' | 'SCHOOL';
export type ExpenseCategory = 'RENT' | 'SALARY' | 'UTILITIES' | 'SUPPLIES' | 'MARKETING' | 'MISC';
export type StockMoveType = 'INTAKE' | 'ADJUST' | 'SALE' | 'VOID' | 'TRANSFER_IN' | 'TRANSFER_OUT';
export type MpesaStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type EmploymentType = 'PERMANENT' | 'CONTRACT' | 'CASUAL' | 'INTERN';
export type PayrollStatus = 'DRAFT' | 'CLOSED';
export type CustomerType = 'SCHOOL' | 'INSTITUTION' | 'BUSINESS' | 'INDIVIDUAL';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'DELIVERED' | 'PAID' | 'CANCELLED';
export type PaymentChannel = 'CASH' | 'MPESA' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD';
export type VatMode = 'EXCLUSIVE' | 'INCLUSIVE';
export type GoodsReceiptStatus = 'DRAFT' | 'POSTED';

/** Values read back from SQLite are plain strings; narrow them at the boundary. */
export const asVatMode = (v: string): VatMode => (v === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE');
