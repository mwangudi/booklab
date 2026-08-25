-- Short sign-in names, so a till user types "mumias.cashier" rather than
-- "mumias.cashier@booklabbookshop.co.ke". Nullable: existing accounts keep
-- signing in with their email until a username is set.
ALTER TABLE `User` ADD COLUMN `username` VARCHAR(60) NULL;
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);
