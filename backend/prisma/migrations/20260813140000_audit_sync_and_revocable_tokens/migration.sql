-- Audit entries need a global identity so a branch can push the actions taken
-- during an outage, and sync credentials need a record that can be revoked.

ALTER TABLE `AuditLog` ADD COLUMN `uuid` VARCHAR(191) NULL;
UPDATE `AuditLog` SET `uuid` = (UUID()) WHERE `uuid` IS NULL;
ALTER TABLE `AuditLog` MODIFY COLUMN `uuid` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `AuditLog_uuid_key` ON `AuditLog`(`uuid`);

CREATE TABLE `SyncToken` (
  `id`          INTEGER NOT NULL AUTO_INCREMENT,
  `jti`         VARCHAR(191) NOT NULL,
  `branchId`    INTEGER NOT NULL,
  `label`       VARCHAR(191) NOT NULL,
  `active`      BOOLEAN NOT NULL DEFAULT true,
  `createdById` INTEGER NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt`  DATETIME(3) NULL,
  `revokedAt`   DATETIME(3) NULL,
  `revokedById` INTEGER NULL,
  UNIQUE INDEX `SyncToken_jti_key`(`jti`),
  INDEX `SyncToken_branchId_idx`(`branchId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SyncToken` ADD CONSTRAINT `SyncToken_branchId_fkey`
  FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
