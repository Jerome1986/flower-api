-- Existing products remain ordinary; custom products are explicitly created by platform admins.
ALTER TABLE `product` ADD COLUMN `type` ENUM('ORDINARY', 'CUSTOM') NOT NULL DEFAULT 'ORDINARY';
