import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { StoreAccess } from '../common/types/store-access'
import { PrismaService } from '../prisma/prisma.service'
import { CatalogQueryDto } from './dto/catalog-query.dto'
import { StoreProductQueryDto } from './dto/store-product-query.dto'
// 关联查询配置。
export const include = {
  store: { select: { id: true, name: true, enabled: true } },
  product: {
    include: {
      category: true,
      specs: {
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
      },
    },
  },
  stocks: true,
} satisfies Prisma.StoreProductInclude
// 门店商品业务数据类型。
type SelectedProduct = Prisma.StoreProductGetPayload<{
  // 关联查询配置。
  include: typeof include
}>
// 门店商品数据库访问。
@Injectable()
export class StoreProductRepository {
  // 注入数据库连接，集中处理门店商品数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按管理员门店权限范围查询目标门店。
  findStore(
    // 门店编号。
    storeId: number,
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.store.findFirst({
      where: {
        AND: [
          { id: storeId },
          { id: scope.storeId, managerId: scope.managerId },
        ],
      },
      select: { id: true, name: true, enabled: true },
    })
  }

  // 按 ID 查询门店商品及展示所需关联信息。
  findById(
    // 当前操作的记录编号。
    id: number,
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.storeProduct.findFirst({
      where: {
        id,
        store: { id: scope.storeId, managerId: scope.managerId },
        product: { type: 'ORDINARY' },
      },
      include,
    })
  }

  // 查询管理员权限范围内的门店选项。
  findStores(
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.store.findMany({
      where: { id: scope.storeId, managerId: scope.managerId },
      select: { id: true, name: true, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
  }

  // 查询平台商品及启用规格。
  findProductWithSpecs(
    // 商品编号。
    productId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.product.findUnique({
      where: { id: productId },
      include: { specs: { where: { enabled: true } } },
    })
  }

  // 创建门店选品记录。
  createProduct(
    // 待保存或处理的数据。
    data: Prisma.StoreProductUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.storeProduct.create({
      data,
    })
  }

  // 批量创建门店规格库存。
  createStocks(
    // 待保存或处理的数据。
    data: Prisma.StoreStockCreateManyInput[],
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.storeStock.createMany({
      data,
    })
  }

  // 更新门店选品记录并返回关联信息。
  updateProduct(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.StoreProductUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.storeProduct.update({ where: { id }, data, include })
  }

  // 按操作幂等键查询库存流水和库存记录。
  findInventoryLog(
    // 业务操作幂等键。
    operationKey: string,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.inventoryLog.findUnique({
      where: { operationKey },
      include: { stock: true },
    })
  }

  // 补充缺失的规格库存，跳过已存在记录。
  createMissingStocks(
    // 待保存或处理的数据。
    data: Prisma.StoreStockCreateManyInput[],
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.storeStock.createMany({
      data,
      skipDuplicates: true,
    })
  }

  // 按门店选品和规格读取库存，不存在时抛出异常。
  getStock(
    // 当前操作的记录编号。
    id: number,
    // 商品规格编号。
    specId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.storeStock.findUniqueOrThrow({
      where: { storeProductId_specId: { storeProductId: id, specId } },
    })
  }

  // 校验版本与原库存数量后更新库存。
  updateStock(
    // 库存记录编号。
    stockId: number,
    // 并发更新版本号。
    version: number,
    // 当前可售库存。
    stockAvailable: number,
    // 当前预留库存。
    stockReserved: number,
    // 待保存或处理的数据。
    data: Prisma.StoreStockUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.storeStock.updateMany({
      where: {
        id: stockId,
        version: version,
        available: stockAvailable,
        reserved: stockReserved,
      },
      data,
    })
  }

  // 写入库存操作流水。
  createInventoryLog(
    // 待保存或处理的数据。
    data: Prisma.InventoryLogUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.inventoryLog.create({
      data,
    })
  }
  // 在传入事务中按筛选条件分页查询门店商品及总数。
  async findPage(
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
    // 列表查询条件。
    query: StoreProductQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 整理数据库查询条件。
    const where: Prisma.StoreProductWhereInput = {
      store: { id: scope.storeId, managerId: scope.managerId },
      storeId: query.storeId,
      enabled: query.enabled,
      ...(query.keyword?.trim()
        ? {
            product: {
              type: 'ORDINARY',
              name: { contains: query.keyword.trim() },
            },
          }
        : { product: { type: 'ORDINARY' } }),
    }
    // 2. 返回本次处理结果。
    return [
      await tx.storeProduct.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { id: 'desc' },
      }),
      await tx.storeProduct.count({ where }),
    ] as const
  }

  // 在传入事务中分页查询可选普通商品及门店选品状态。
  async findCatalogPage(
    // 列表查询条件。
    query: CatalogQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 整理数据库查询条件。
    const where: Prisma.ProductWhereInput = {
      type: 'ORDINARY',
      enabled: true,
      specs: { some: { enabled: true } },
      ...(query.keyword?.trim()
        ? { name: { contains: query.keyword.trim() } }
        : {}),
    }
    // 2. 返回本次处理结果。
    return [
      await tx.product.findMany({
        where,
        include: {
          category: true,
          specs: {
            where: { enabled: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
          storeProducts: {
            where: { storeId: query.storeId },
            select: { id: true },
          },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
      }),
      await tx.product.count({ where }),
    ] as const
  }

  // 在传入事务中分页查询门店商品库存流水及总数。
  async findLogsPage(
    // 当前操作的记录编号。
    id: number,
    // 列表查询条件。
    query: StoreProductQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 整理数据库查询条件。
    const where: Prisma.InventoryLogWhereInput = {
      stock: { storeProductId: id },
    }
    // 2. 返回本次处理结果。
    return [
      await tx.inventoryLog.findMany({
        where,
        include: {
          stock: { select: { spec: { select: { name: true, unit: true } } } },
          admin: { select: { username: true } },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      await tx.inventoryLog.count({ where }),
    ] as const
  }
}
