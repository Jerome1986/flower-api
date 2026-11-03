-- Preserve existing rows and FK indexes.
ALTER TABLE `order_item` ADD COLUMN `product_id` INTEGER NULL, ADD COLUMN `remark` VARCHAR(500) NULL;
CREATE INDEX `order_item_order_id_idx` ON `order_item`(`order_id`);
DROP INDEX `order_item_order_id_key` ON `order_item`;
UPDATE `order_item` i JOIN `product_spec` s ON s.id = i.spec_id SET i.product_id = s.product_id;
