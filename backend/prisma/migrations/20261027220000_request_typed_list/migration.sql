-- Website quotation form: a typed list and a preferred branch on a request.
-- AlterTable
ALTER TABLE `CustomerRequest` ADD COLUMN `listText` TEXT NULL,
    ADD COLUMN `preferredBranch` VARCHAR(60) NULL;

