ALTER TABLE `order` ADD COLUMN `payment_lease_token` VARCHAR(36) NULL,
  ADD COLUMN `payment_lease_until` DATETIME(3) NULL;
ALTER TABLE `payment` ADD COLUMN `payer_open_id` VARCHAR(128) NULL;
ALTER TABLE `refund` MODIFY COLUMN `admin_id` INTEGER NULL;
