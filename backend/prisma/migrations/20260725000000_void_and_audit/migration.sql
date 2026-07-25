-- Sale void/reversal support. Voided sales are excluded from all revenue reporting.
ALTER TABLE `Sale`
  ADD COLUMN `voidedAt` DATETIME(3) NULL,
  ADD COLUMN `voidedById` INTEGER NULL,
  ADD COLUMN `voidReason` VARCHAR(191) NULL;

CREATE INDEX `Sale_voidedAt_idx` ON `Sale`(`voidedAt`);

ALTER TABLE `Sale`
  ADD CONSTRAINT `Sale_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Stock movement: record the actor and widen the event types.
ALTER TABLE `StockMovement`
  ADD COLUMN `userId` INTEGER NULL,
  MODIFY `type` ENUM('INTAKE', 'ADJUST', 'SALE', 'VOID', 'TRANSFER_IN', 'TRANSFER_OUT') NOT NULL DEFAULT 'INTAKE';

CREATE INDEX `StockMovement_bookId_createdAt_idx` ON `StockMovement`(`bookId`, `createdAt`);

ALTER TABLE `StockMovement`
  ADD CONSTRAINT `StockMovement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only audit trail for sensitive changes (price overrides, voids, transfers).
CREATE TABLE `AuditLog` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NULL,
  `branchId` INTEGER NULL,
  `entity` VARCHAR(191) NOT NULL,
  `entityId` INTEGER NULL,
  `action` VARCHAR(191) NOT NULL,
  `details` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `AuditLog_entity_createdAt_idx`(`entity`, `createdAt`),
  INDEX `AuditLog_branchId_createdAt_idx`(`branchId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AuditLog`
  ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
