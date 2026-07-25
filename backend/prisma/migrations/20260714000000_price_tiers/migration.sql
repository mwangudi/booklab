-- AlterTable: wholesale & school price tiers on Book (null => retail unitPrice applies)
ALTER TABLE `Book`
  ADD COLUMN `priceWholesale` DECIMAL(10, 2) NULL,
  ADD COLUMN `priceSchool` DECIMAL(10, 2) NULL;

-- AlterTable: record which price tier a Sale used
ALTER TABLE `Sale`
  ADD COLUMN `priceTier` ENUM('RETAIL', 'WHOLESALE', 'SCHOOL') NOT NULL DEFAULT 'RETAIL';
