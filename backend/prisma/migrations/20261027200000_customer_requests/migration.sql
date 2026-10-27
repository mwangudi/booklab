-- Requests sent from the public catalogue on the website, turned into invoices by staff.
-- CreateTable
CREATE TABLE `CustomerRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(40) NOT NULL,
    `email` VARCHAR(160) NULL,
    `organisation` VARCHAR(160) NULL,
    `location` VARCHAR(200) NOT NULL,
    `note` TEXT NULL,
    `status` ENUM('NEW', 'CONTACTED', 'INVOICED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `invoiceId` INTEGER NULL,
    `handledById` INTEGER NULL,
    `ip` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CustomerRequest_uuid_key`(`uuid`),
    UNIQUE INDEX `CustomerRequest_number_key`(`number`),
    INDEX `CustomerRequest_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerRequestItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `bookId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomerRequestItem` ADD CONSTRAINT `CustomerRequestItem_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `CustomerRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerRequestItem` ADD CONSTRAINT `CustomerRequestItem_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

