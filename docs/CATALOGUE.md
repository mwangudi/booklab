# The product catalogue

How Booklab's catalogue was built, how products are named and coded, and what is still
open. Written 2026-10-27, after the catalogue import of that day.

## Where the products come from

| Codes | Source | How many | Prices |
|---|---|---|---|
| `PL-0001`–`PL-0714` | **Booklab Catalogue 2026** — the shop's own price brochure (`docs/Booklab Catalogue 2026.pdf`, pages 2–4) | 714 | Retail = the brochure price (VAT inclusive). No cost unless a matching supplier item supplied one. |
| `BS-0001`–`BS-1173` | **Bhavinn Stationers price list** (`docs/Stationery List.xls`) | 1,173 imported, 1,160 live | Cost = the sheet's **Retail** column, which is Booklab's buying price. No selling price: set it in the products grid. |
| `ST…` | Earlier Kangaro / Luxor / Nucleus quotation | 12 | Retail, wholesale, school and cost from that quotation. |

1,899 products in all; 1,886 are live and 13 are archived duplicates.

The two source files are kept in `docs/` but are not in git. The PDF's first page is a KRA
tax-compliance certificate carrying a personal PIN.

## Naming: every name is unique and says what the item is

The brochure lists many items under a short heading: "SUFURIAS — SMALL, MEDIUM, LARGE",
"FLASH DISKS — 16GB, 32GB, 64GB". The first load of the brochure used those short names on
their own. Products then clashed ("LARGE" was a flag, an abacus, a sufuria, a sufuria with
lid and a jiko), and only one product survived per name, so items were lost.

Names now carry their section: `SUFURIA WITH LID LARGE`, `TEA URN ELECTRIC 20L`,
`FLASH DISK 64GB`, `CELLOTAPE 1 INCH`, `MASKING TAPE 1 INCH`. Two products may not share a
name. Names are compared ignoring case, spaces and punctuation, so `OFFICE GLUE 90 GMS`
and `OFFICE GLUE 90GMS` count as the same.

When adding products, follow the same rule: section first, then the variant.

## What the 2026-10-27 import did

- **225 brochure products renamed** to their full names. They keep their code, price,
  stock and sales history; 87 more only changed category.
- **55 brochure items created** that the first load had lost, at brochure prices.
  Examples: the electric tea urns, the Mikasa balls, sufurias with lid, jikos, the 14 JSS
  readers and the 11 regulatory documents.
- **1,173 Bhavinn items created.** Within the sheet, 3 repeated rows were skipped; 6 more
  were skipped because the catalogue already had them.
- **13 same-product pairs merged** across the two files. The brochure (or quotation)
  product stays, keeps its selling price and takes the buying price; the copy is archived.

Every created, renamed, merged or re-costed product is listed in
[catalogue-import-2026-10-27.csv](catalogue-import-2026-10-27.csv), and every change is in
the audit log.

## Pricing

- **Set prices in the products grid**: Products → **Edit in grid** (admins, or anyone
  granted *Edit prices & stock in a grid*). Tick **No price yet** to list what still needs a
  selling price; that is mostly the Bhavinn items.
- A product with retail 0 cannot be sold: the till refuses it until it has a price.
- Wholesale and school prices are optional and fall back to retail.
- A branch can hold its own prices. Choose the branch in the grid; a blank cell uses the
  catalogue price.

## Still open

Pairs that may be the same product, left for the owner to decide:

- the DP 520 paper punch, three times: `PL-0112` (750), `ST00574` Kangaro DP 520 (400)
  and `BS-0525` "DP-540/520";
- the brochure's `STAPLER D45 (MEDIUM)` (650) and `ST00657` Kangaro HD 45S (405);
- generic brochure items against branded sheet items: HB Staedtler pencil, Pelikan glue
  sticks, PVC spring files, BIC fine point pens.

To merge a pair, keep the product with the selling price, give it the other's buying
price as cost, and archive the other. Archiving is allowed only while the copy has no
sales, invoices, goods receipts or stock.

Also open: 703 of the 714 brochure products have no cost yet, so their profit shows as 100% until a
cost is entered, for example when the goods are next received.
