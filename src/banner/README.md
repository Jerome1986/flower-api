# 首页轮播图

后台入口：平台设置 → Banner 设置。使用既有 PlatformConfig(id=1).homeContent.banners 保存最多20张图片，不需要数据库迁移。只替换 banners，保留定制服务字段和其他首页内容。

- `GET /api/admin/banners`：平台管理员、超级管理员读取全部配置，返回 banners 和 updatedAt。
- `PUT /api/admin/banners`：整体保存 banners 和上次读取的 updatedAt（未配置时 null）。通过列表新增、编辑、排序、启停或删除；版本不符返回409，提示重新加载。
- `GET /api/home/banners`：公开读取已启用轮播图，按 sortOrder 升序、id 稳定排序，不返回其他平台设置。

每张图片字段：id（UUID）、title（1至100字）、image（HTTP/HTTPS 或站内绝对路径，最长1024字符）、enabled（布尔）、sortOrder（0至2147483647整数）。后台使用现有 Element Plus 自动图片上传组件，图片未上传完成时禁止保存。删除只移除轮播图配置，不删除共享图片文件。

本模块提供管理页面与首页读取接口；当前小程序首页未接入轮播图展示组件，需在首页开发时调用公开接口。
