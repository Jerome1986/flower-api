# 后台总商品库接口

后台入口：`/products/library`。接口前缀：`/api/admin/products`。
所有接口需要 `Authorization: Bearer <token>`，仅 `SUPER_ADMIN`、`PLATFORM_ADMIN` 可访问。
响应沿用 `{ code: 200, message, data }`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/` | 分页查询 |
| GET | `/categories` | 分类选项（含停用分类，用于回显） |
| POST | `/categories` | 新增分类 |
| PATCH | `/categories/:id` | 编辑分类名称、启停与排序 |
| GET | `/:id` | 商品详情，含全部规格 |
| POST | `/` | 新增商品与规格 |
| PATCH | `/:id` | 完整保存商品与规格 |
| PATCH | `/:id/status` | 上下架，提交 `{ "enabled": true }` |

查询参数：`page`（默认 1）、`pageSize`（默认 10，上限 100）、`keyword`（商品名称）、`categoryId`、`enabled`（true/false）。列表返回 `{ list, total, page, pageSize }`。

分类管理入口：`/products/categories`（商品中心 → 商品分类）。分类写入参数为 `{ "name": "玫瑰", "enabled": true, "sortOrder": 0 }`，名称去除首尾空格后不能为空且全局唯一。停用分类保留现有商品关联，不能新选；不会连带下架商品。

新增和编辑提交示例：

```json
{
  "name": "玫瑰",
  "categoryId": null,
  "coverImage": "https://example.com/rose.jpg",
  "images": [],
  "description": "商品说明",
  "enabled": true,
  "sortOrder": 0,
  "specs": [
    {
      "name": "8支",
      "unit": "份",
      "price": 1990,
      "stemsPerUnit": 8,
      "enabled": true,
      "sortOrder": 0
    }
  ]
}
```

金额输入和输出均为整数分，数据库保存 Decimal 元。每份支数可为 null，不设置全局库存。
封面图 `coverImage` 为单张图片 URL，商品详情图 `images` 为按选择顺序保存的图片 URL 数组（最多 20 张）。后台使用 Element Plus 自动上传图片卡片组件，支持回显、预览和移除；图片直传地址沿用 920ADMIN，可通过 `VITE_IMAGE_UPLOAD_URL` 配置，选图限制为 JPG/PNG/WebP/GIF、单张不超过 5MB。上传完成后再保存商品资料。
商品编号不作为业务字段输入、输出或搜索；兼容现有数据库必填列，新增时由服务端内部生成，编辑时保留原值。
编辑现有规格须携带详情返回的规格 `id`，新增规格不传 `id`。规格名称在商品内唯一。
遗漏的历史规格保留并停用；界面通过停用开关维护历史规格。商品通过下架停用，不提供物理删除。
商品只按分类管理，不再区分 A/B 类型；所有商品均可供门店选品、维护库存与配置履约方式。商品和规格在同一事务中保存。

验证：后台 `vue-tsc --build`、`vite build`；接口 `nest build`、`jest --runInBand product`。
单元测试使用模拟数据，不代表已经通过真实数据库联调。

已有数据库升级：执行 `prisma db execute --file prisma/remove-product-type.sql` 后运行 `prisma generate` 并重启接口服务。脚本移除商品与订单明细的旧类型列、更新索引，并将优惠券旧 A/B 范围统一为 ALL。使用 `node scripts/check-product-model.cjs` 进行只读数据库结构和商品查询验证。
