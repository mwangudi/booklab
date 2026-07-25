-- AlterTable: per-branch selling price override (null = use catalogue Book.unitPrice)
ALTER TABLE `Stock` ADD COLUMN `price` DECIMAL(10, 2) NULL;
