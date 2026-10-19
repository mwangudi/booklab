-- Per-branch stock take schedule: how often each branch does a full count and
-- when the next one is due. Set by an admin; completed by posting a full count.
-- CreateTable
CREATE TABLE `StockTakeSchedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `frequency` ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY') NOT NULL DEFAULT 'MONTHLY',
    `nextDue` DATETIME(3) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `lastDoneAt` DATETIME(3) NULL,
    `lastDoneById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StockTakeSchedule_branchId_key`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockTakeSchedule` ADD CONSTRAINT `StockTakeSchedule_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

