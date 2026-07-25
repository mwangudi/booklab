-- Count duplicate receipt copies so a reprint can be clearly marked on the paper.
ALTER TABLE `Sale`
  ADD COLUMN `reprintCount` INTEGER NOT NULL DEFAULT 0;
