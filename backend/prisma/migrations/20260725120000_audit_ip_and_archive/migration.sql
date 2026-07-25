-- Record the caller's IP on every audited action and index the trail for querying.
ALTER TABLE `AuditLog`
  ADD COLUMN `ip` VARCHAR(45) NULL;

CREATE INDEX `AuditLog_userId_createdAt_idx` ON `AuditLog`(`userId`, `createdAt`);
CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog`(`createdAt`);

-- Index the soft-delete flag so the live catalogue query stays fast.
CREATE INDEX `Book_deletedAt_idx` ON `Book`(`deletedAt`);
