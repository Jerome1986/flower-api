-- 商品统一按分类管理。可重复执行；兼容尚未创建商品表的开发库。
-- 保留商品、分类、规格、订单、库存及券记录，仅移除旧类型列与限制。
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'product' AND index_name = 'product_type_enabled_sort_order_idx'), 'ALTER TABLE `product` DROP INDEX `product_type_enabled_sort_order_idx`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product' AND column_name = 'type'), 'ALTER TABLE `product` DROP COLUMN `type`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'product') AND NOT EXISTS(SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'product' AND index_name = 'product_enabled_sort_order_idx'), 'CREATE INDEX `product_enabled_sort_order_idx` ON `product` (`enabled`, `sort_order`)', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_item' AND column_name = 'product_type'), 'ALTER TABLE `order_item` DROP COLUMN `product_type`', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

-- 现金券不再按旧商品类型限定范围，兑换券仍按指定商品规格校验。
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'coupon_template' AND column_name = 'scope'), 'ALTER TABLE `coupon_template` MODIFY COLUMN `scope` VARCHAR(10) NOT NULL DEFAULT ''ALL''', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'coupon_template' AND column_name = 'scope'), 'UPDATE `coupon_template` SET `scope` = ''ALL''', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'coupon_template' AND column_name = 'scope'), 'ALTER TABLE `coupon_template` MODIFY COLUMN `scope` ENUM(''ALL'') NOT NULL DEFAULT ''ALL''', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_coupon' AND column_name = 'scope'), 'ALTER TABLE `user_coupon` MODIFY COLUMN `scope` VARCHAR(10) NOT NULL', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_coupon' AND column_name = 'scope'), 'UPDATE `user_coupon` SET `scope` = ''ALL''', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_coupon' AND column_name = 'scope'), 'ALTER TABLE `user_coupon` MODIFY COLUMN `scope` ENUM(''ALL'') NOT NULL', 'SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
