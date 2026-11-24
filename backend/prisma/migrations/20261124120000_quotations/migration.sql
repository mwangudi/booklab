-- CreateTable
CREATE TABLE `Quotation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `ref` VARCHAR(12) NULL,
    `customerId` INTEGER NOT NULL,
    `branchId` INTEGER NULL,
    `status` ENUM('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'DRAFT',
    `priceTier` ENUM('RETAIL', 'WHOLESALE', 'SCHOOL') NOT NULL DEFAULT 'SCHOOL',
    `issueDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validDays` INTEGER NOT NULL DEFAULT 30,
    `notes` TEXT NULL,
    `chargeVat` BOOLEAN NOT NULL DEFAULT true,
    `vatMode` ENUM('EXCLUSIVE', 'INCLUSIVE') NOT NULL DEFAULT 'EXCLUSIVE',
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `vatTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Quotation_uuid_key`(`uuid`),
    UNIQUE INDEX `Quotation_number_key`(`number`),
    UNIQUE INDEX `Quotation_ref_key`(`ref`),
    INDEX `Quotation_customerId_issueDate_idx`(`customerId`, `issueDate`),
    INDEX `Quotation_status_idx`(`status`),
    INDEX `Quotation_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(191) NOT NULL,
    `quotationId` INTEGER NOT NULL,
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

    UNIQUE INDEX `QuotationItem_uuid_key`(`uuid`),
    INDEX `QuotationItem_quotationId_idx`(`quotationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

