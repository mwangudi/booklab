-- One company-wide delivery-note series: two invoices issued at the same moment must
-- never share a number. NULLs (not yet issued) are allowed many times.
-- CreateIndex
CREATE UNIQUE INDEX `Invoice_deliveryNoteNo_key` ON `Invoice`(`deliveryNoteNo`);
