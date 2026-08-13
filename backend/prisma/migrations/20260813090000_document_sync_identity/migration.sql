-- Give the trading documents a global identity so they can sync between a branch
-- and the cloud, and give each branch a code to prefix the documents it raises.

-- Branch code: first three letters of the name, e.g. Kapsabet -> KAP.
ALTER TABLE `Branch` ADD COLUMN `code` VARCHAR(191) NULL;
UPDATE `Branch` SET `code` = UPPER(LEFT(REGEXP_REPLACE(`name`, '[^A-Za-z]', ''), 3)) WHERE `code` IS NULL;
-- Break any tie deterministically rather than failing the migration.
UPDATE `Branch` b
  JOIN (SELECT `code` AS c, MIN(`id`) AS keep_id FROM `Branch` GROUP BY `code` HAVING COUNT(*) > 1) d
    ON b.`code` = d.c AND b.`id` <> d.keep_id
  SET b.`code` = CONCAT(b.`code`, b.`id`);
ALTER TABLE `Branch` MODIFY COLUMN `code` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `Branch_code_key` ON `Branch`(`code`);

ALTER TABLE `Invoice` ADD COLUMN `uuid` VARCHAR(191) NULL;
UPDATE `Invoice` SET `uuid` = (UUID()) WHERE `uuid` IS NULL;
ALTER TABLE `Invoice` MODIFY COLUMN `uuid` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `Invoice_uuid_key` ON `Invoice`(`uuid`);

ALTER TABLE `InvoiceItem` ADD COLUMN `uuid` VARCHAR(191) NULL;
UPDATE `InvoiceItem` SET `uuid` = (UUID()) WHERE `uuid` IS NULL;
ALTER TABLE `InvoiceItem` MODIFY COLUMN `uuid` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `InvoiceItem_uuid_key` ON `InvoiceItem`(`uuid`);

ALTER TABLE `GoodsReceipt` ADD COLUMN `uuid` VARCHAR(191) NULL;
UPDATE `GoodsReceipt` SET `uuid` = (UUID()) WHERE `uuid` IS NULL;
ALTER TABLE `GoodsReceipt` MODIFY COLUMN `uuid` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `GoodsReceipt_uuid_key` ON `GoodsReceipt`(`uuid`);

ALTER TABLE `GoodsReceiptItem` ADD COLUMN `uuid` VARCHAR(191) NULL;
UPDATE `GoodsReceiptItem` SET `uuid` = (UUID()) WHERE `uuid` IS NULL;
ALTER TABLE `GoodsReceiptItem` MODIFY COLUMN `uuid` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `GoodsReceiptItem_uuid_key` ON `GoodsReceiptItem`(`uuid`);

ALTER TABLE `CustomerPayment`
  ADD COLUMN `uuid` VARCHAR(191) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `CustomerPayment` SET `uuid` = (UUID()) WHERE `uuid` IS NULL;
ALTER TABLE `CustomerPayment` MODIFY COLUMN `uuid` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `CustomerPayment_uuid_key` ON `CustomerPayment`(`uuid`);

ALTER TABLE `SupplierPayment`
  ADD COLUMN `uuid` VARCHAR(191) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `SupplierPayment` SET `uuid` = (UUID()) WHERE `uuid` IS NULL;
ALTER TABLE `SupplierPayment` MODIFY COLUMN `uuid` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `SupplierPayment_uuid_key` ON `SupplierPayment`(`uuid`);
