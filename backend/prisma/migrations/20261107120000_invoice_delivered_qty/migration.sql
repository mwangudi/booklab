-- Invoices stay editable after delivery: each line records how much has left the shelf.
-- AlterTable
ALTER TABLE `InvoiceItem` ADD COLUMN `deliveredQty` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Everything on an invoice delivered before this change went out in full.
UPDATE `InvoiceItem` ii
  JOIN `Invoice` i ON i.`id` = ii.`invoiceId`
  SET ii.`deliveredQty` = ii.`quantity`
  WHERE i.`status` IN ('DELIVERED', 'PAID');
