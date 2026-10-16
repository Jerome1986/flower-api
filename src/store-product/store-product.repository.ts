import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { StoreAccess } from '../common/types/store-access'
import { PrismaService } from '../prisma/prisma.service'
import { CatalogQueryDto } from './dto/catalog-query.dto'
import { StoreProductQueryDto } from './dto/store-product-query.dto'
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
type SelectedProduct = Prisma.StoreProductGetPayload<{
  include: typeof include
}>
@Injectable()
export class StoreProductRepository {
  // 注入数据库连接，集中处理门店商品数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按管理员门店权限范围查询目标门店。
  findStore(
    storeId: number,
    scope: StoreAccess,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
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
  findById(id: number, scope: StoreAccess, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
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
  findStores(scope: StoreAccess) {
    return this.prisma.store.findMany({
      where: { id: scope.storeId, managerId: scope.managerId },
      select: { id: true, name: true, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
  }

  // 查询平台商品及启用规格。
  findProductWithSpecs(productId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.product.findUnique({
      where: { id: productId },
      include: { specs: { where: { enabled: true } } },
    })
  }

  // 创建门店选品记录。
  createProduct(
    data: Prisma.StoreProductUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.storeProduct.create({
      data,
    })
  }

  // 批量创建门店规格库存。
  createStocks(
    data: Prisma.StoreStockCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.storeStock.createMany({
      data,
    })
  }

  // 更新门店选品记录并返回关联信息。
  updateProduct(
    id: number,
    data: Prisma.StoreProductUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.storeProduct.update({ where: { id }, data, include })
  }

  // 按操作幂等键查询库存流水和库存记录。
  findInventoryLog(operationKey: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.inventoryLog.findUnique({
      where: { operationKey },
      include: { stock: true },
    })
  }

  // 补充缺失的规格库存，跳过已存在记录。
  createMissingStocks(
    data: Prisma.StoreStockCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.storeStock.createMany({
      data,
      skipDuplicates: true,
    })
  }

  // 按门店选品和规格读取库存，不存在时抛出异常。
  getStock(id: number, specId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.storeStock.findUniqueOrThrow({
      where: { storeProductId_specId: { storeProductId: id, specId } },
    })
  }

  // 校验版本与原库存数量后更新库存。
  updateStock(
    stockId: number,
    version: number,
    stockAvailable: number,
    stockReserved: number,
    data: Prisma.StoreStockUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
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
    data: Prisma.InventoryLogUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.inventoryLog.create({
      data,
    })
  }
  // 在传入事务中按筛选条件分页查询门店商品及总数。
  async findPage(
    scope: StoreAccess,
    query: StoreProductQueryDto,
    tx: Prisma.TransactionClient,
  ) {
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
  async findCatalogPage(query: CatalogQueryDto, tx: Prisma.TransactionClient) {
    const where: Prisma.ProductWhereInput = {
      type: 'ORDINARY',
      enabled: true,
      specs: { some: { enabled: true } },
      ...(query.keyword?.trim()
        ? { name: { contains: query.keyword.trim() } }
        : {}),
    }
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
    id: number,
    query: StoreProductQueryDto,
    tx: Prisma.TransactionClient,
  ) {
    const where: Prisma.InventoryLogWhereInput = {
      stock: { storeProductId: id },
    }
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
