-- Login-screen carousel.
--
-- The image bytes are stored here rather than on disk so that a restored
-- database backup brings the branding back with it, and so that a redeploy
-- (which replaces frontend/dist wholesale) cannot wipe the pictures.
CREATE TABLE `PromoSlide` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(120) NULL,
    `subtitle` VARCHAR(300) NULL,
    `mimeType` VARCHAR(60) NOT NULL DEFAULT 'image/jpeg',
    `image` LONGBLOB NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PromoSlide_active_sortOrder_idx`(`active`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
