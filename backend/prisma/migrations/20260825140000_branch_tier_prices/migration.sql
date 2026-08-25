-- Per-branch wholesale, school and cost prices.
--
-- Stock already carried a single retail override; a branch can genuinely buy at
-- a different price and sell each tier differently. All nullable: null means
-- "use the catalogue value on Book", so a branch stores only its differences.
ALTER TABLE `Stock`
  ADD COLUMN `priceWholesale` DECIMAL(10, 2) NULL,
  ADD COLUMN `priceSchool` DECIMAL(10, 2) NULL,
  ADD COLUMN `costPrice` DECIMAL(10, 2) NULL;
