# 门店选品与库存

后台入口：平台“商品中心 → 门店选品与库存”；门店账号“本店商品”“库存维护”。
接口前缀：`/api/admin/store-products`，沿用 Bearer 登录与统一 `{ code, message, data }` 响应。
平台管理员可管理全部门店，店长按当前 `Store.managerId` 关联管理，旧 `STORE_ADMIN` 只可操作绑定门店；其他角色拒绝访问。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/stores` | 当前可管理门店的 ID、名称和启停状态 |
| GET | `/catalog` | 总商品库可选商品，含本店是否已添加；必传 storeId |
| GET | `/` | 已选商品分页、规格售价及可售/占用库存 |
| POST | `/` | 添加商品并初始化可用规格的零库存 |
| GET | `/:id` | 当前商品设置与规格库存 |
| PATCH | `/:id` | 本店上下架及自取、配送设置 |
| PATCH | `/:id/stocks/:specId` | 设置调整后的可售总数量 |
| GET | `/:id/logs` | 库存变动流水分页 |

列表参数 `page`（默认1）、`pageSize`（默认10，最大100）、`storeId`、`keyword`（商品名称）、`enabled`（本店上架状态）。分页返回 `{ list, total, page, pageSize }`。
目录只展示已上架且有启用规格的商品；下架的已选商品仍保留并可管理。

选品提交 `{ storeId, productId, enabled, pickupEnabled, deliveryEnabled }`。同店同商品不可重复添加，不提供物理删除，通过下架停用。界面默认下架后再设置库存。
商品设置提交 `{ enabled, pickupEnabled, deliveryEnabled }`；上架须至少支持一种取货方式，并确保门店、平台商品、至少一个规格启用。

库存提交 `{ available, version, reason, operationKey }`：

- `available` 是调整后的可售销售份数，非负整数，最大 2147483647。
- `version` 取详情返回值；版本或读取数量变化时返回409，前端刷新后重新调整。
- `reason` 必填，最多500字；`operationKey` 是一次操作生成的 UUID，失败重试必须复用。
- 不允许提交 `reserved`、价格或商品规格定义。订单占用保留；平台统一定价（响应价格单位整数分，界面展示元）。
- 调整、版本递增、流水写入在同一事务中；唯一操作标识防止重复生效。店长身份通过服务端前缀记入操作标识，不占用 Admin 外键。
- 商品库后续新增的规格在查询时显示零库存，首次调整时创建本店库存；查询不写数据库。

验证：`nest build`；`jest --runInBand store-product product`；`node scripts/check-store-products.cjs`（真实数据库测试全部回滚）。前端 `vue-tsc --build`、`vite build`。
