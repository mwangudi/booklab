/** The address of a quotation's page, by its short link code (/quotations/XR56LK). */
export const quotationPath = (q: { id: number; ref?: string | null }) => `/quotations/${q.ref ?? q.id}`;
