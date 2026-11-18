/**
 * The address of an invoice's page. It uses the invoice's short link code
 * (/invoices/XR56LK) rather than its sequential id, so a URL says nothing about how
 * many invoices exist; the id is only a fallback for rows that have no code yet.
 */
export const invoicePath = (inv: { id: number; ref?: string | null }) => `/invoices/${inv.ref ?? inv.id}`;
