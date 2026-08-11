-- Till discounts. `subtotal` is the sum of the lines and `total` is what the
-- customer actually paid, so revenue reporting stays net of any discount.
ALTER TABLE `Sale`
  ADD COLUMN `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `discountReason` VARCHAR(191) NULL;

-- Existing sales had no discount, so their subtotal is simply the total.
UPDATE `Sale` SET `subtotal` = `total` WHERE `subtotal` = 0;
