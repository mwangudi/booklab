-- Units of measure on products (pieces, dozens, reams, cartons, metres…) and the
-- VAT rate each product attracts. Printed books are zero-rated in Kenya, so the
-- rate is held per product rather than assumed.
ALTER TABLE `Book`
  ADD COLUMN `unit` VARCHAR(191) NOT NULL DEFAULT 'Piece',
  ADD COLUMN `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 16;

-- Customers we supply on account: schools, institutions and businesses.
CREATE TABLE `Customer` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('SCHOOL', 'INSTITUTION', 'BUSINESS', 'INDIVIDUAL') NOT NULL DEFAULT 'SCHOOL',
  `contactPerson` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `address` VARCHAR(191) NULL,
  `kraPin` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `chargeVat` BOOLEAN NOT NULL DEFAULT true,
  `vatMode` ENUM('EXCLUSIVE', 'INCLUSIVE') NOT NULL DEFAULT 'EXCLUSIVE',
  `openingBalance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `openingBalanceDate` DATETIME(3) NULL,
  `paymentTermsDays` INTEGER NOT NULL DEFAULT 30,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `uuid` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `Customer_uuid_key`(`uuid`),
  INDEX `Customer_deletedAt_idx`(`deletedAt`),
  INDEX `Customer_name_idx`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Invoice` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `number` VARCHAR(191) NOT NULL,
  `deliveryNoteNo` VARCHAR(191) NULL,
  `customerId` INTEGER NOT NULL,
  `branchId` INTEGER NULL,
  `status` ENUM('DRAFT', 'ISSUED', 'DELIVERED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `priceTier` ENUM('RETAIL', 'WHOLESALE', 'SCHOOL') NOT NULL DEFAULT 'SCHOOL',
  `issueDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `dueDate` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `receivedBy` VARCHAR(191) NULL,
  `receivedIdNo` VARCHAR(191) NULL,
  `receivedDesignation` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `chargeVat` BOOLEAN NOT NULL DEFAULT true,
  `vatMode` ENUM('EXCLUSIVE', 'INCLUSIVE') NOT NULL DEFAULT 'EXCLUSIVE',
  `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `vatTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `saleId` INTEGER NULL,
  `createdById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `Invoice_number_key`(`number`),
  INDEX `Invoice_customerId_issueDate_idx`(`customerId`, `issueDate`),
  INDEX `Invoice_status_idx`(`status`),
  INDEX `Invoice_deletedAt_idx`(`deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InvoiceItem` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `invoiceId` INTEGER NOT NULL,
  `bookId` INTEGER NULL,
  `description` VARCHAR(191) NOT NULL,
  `unit` VARCHAR(191) NOT NULL DEFAULT 'Piece',
  `quantity` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `unitPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `vatRate` DECIMAL(5, 2) NOT NULL DEFAULT 16,
  `netAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `vatAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,

  INDEX `InvoiceItem_invoiceId_idx`(`invoiceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Invoice`
  ADD CONSTRAINT `Invoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Invoice_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `InvoiceItem`
  ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `InvoiceItem_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Receipts against credit accounts; these appear as PMT credits on a statement.
CREATE TABLE `CustomerPayment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customerId` INTEGER NOT NULL,
  `invoiceId` INTEGER NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `method` ENUM('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CARD') NOT NULL DEFAULT 'BANK_TRANSFER',
  `reference` VARCHAR(191) NULL,
  `note` VARCHAR(191) NULL,
  `createdById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,

  INDEX `CustomerPayment_customerId_paidAt_idx`(`customerId`, `paidAt`),
  INDEX `CustomerPayment_invoiceId_idx`(`invoiceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CustomerPayment`
  ADD CONSTRAINT `CustomerPayment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `CustomerPayment_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Suppliers and goods received notes keyed from their delivery notes.
CREATE TABLE `Supplier` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `contactPerson` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `address` VARCHAR(191) NULL,
  `kraPin` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `openingBalance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `openingBalanceDate` DATETIME(3) NULL,
  `paymentTermsDays` INTEGER NOT NULL DEFAULT 30,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `uuid` VARCHAR(191) NOT NULL,

  UNIQUE INDEX `Supplier_uuid_key`(`uuid`),
  INDEX `Supplier_deletedAt_idx`(`deletedAt`),
  INDEX `Supplier_name_idx`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GoodsReceipt` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `number` VARCHAR(191) NOT NULL,
  `supplierId` INTEGER NOT NULL,
  `branchId` INTEGER NOT NULL,
  `deliveryNoteNo` VARCHAR(191) NULL,
  `invoiceNo` VARCHAR(191) NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` ENUM('DRAFT', 'POSTED') NOT NULL DEFAULT 'DRAFT',
  `notes` TEXT NULL,
  `totalCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `createdById` INTEGER NULL,
  `postedById` INTEGER NULL,
  `postedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `GoodsReceipt_number_key`(`number`),
  INDEX `GoodsReceipt_supplierId_receivedAt_idx`(`supplierId`, `receivedAt`),
  INDEX `GoodsReceipt_branchId_receivedAt_idx`(`branchId`, `receivedAt`),
  INDEX `GoodsReceipt_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `GoodsReceiptItem` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `receiptId` INTEGER NOT NULL,
  `bookId` INTEGER NOT NULL,
  `description` VARCHAR(191) NOT NULL,
  `unit` VARCHAR(191) NOT NULL DEFAULT 'Piece',
  `quantity` INTEGER NOT NULL DEFAULT 0,
  `unitCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,

  INDEX `GoodsReceiptItem_receiptId_idx`(`receiptId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GoodsReceipt`
  ADD CONSTRAINT `GoodsReceipt_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `GoodsReceipt_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `GoodsReceiptItem`
  ADD CONSTRAINT `GoodsReceiptItem_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `GoodsReceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `GoodsReceiptItem_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payments out to suppliers; these reconcile against the statements they send us.
CREATE TABLE `SupplierPayment` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `supplierId` INTEGER NOT NULL,
  `receiptId` INTEGER NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `method` ENUM('CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CARD') NOT NULL DEFAULT 'BANK_TRANSFER',
  `reference` VARCHAR(191) NULL,
  `note` VARCHAR(191) NULL,
  `createdById` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,

  INDEX `SupplierPayment_supplierId_paidAt_idx`(`supplierId`, `paidAt`),
  INDEX `SupplierPayment_receiptId_idx`(`receiptId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SupplierPayment`
  ADD CONSTRAINT `SupplierPayment_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `SupplierPayment_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `GoodsReceipt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
