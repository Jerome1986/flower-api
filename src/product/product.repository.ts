import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ProductQueryDto } from './dto/product-query.dto'
// 关联查询配置。
export const include = {
  category: true,
  specs: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
}
// 商品业务数据类型。
type ProductDetail = Prisma.ProductGetPayload<{
  // 关联查询配置。
  include: typeof include
}>
// 商品数据库访问。
@Injectable()
export class ProductRepository {
  // 注入数据库连接，集中处理商品数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按排序值和 ID 查询商品分类。
  findCategories() {
    // 1. 按条件读取数据库记录。
    return this.prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
  }

  // 创建商品分类。
  createCategory(
    // 待保存或处理的数据。
    data: Prisma.ProductCategoryUncheckedCreateInput,
  ) {
    // 1. 保存本次业务数据变更。
    return this.prisma.productCategory.create({ data })
  }

  // 按 ID 更新商品分类。
  updateCategory(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.ProductCategoryUncheckedUpdateInput,
  ) {
    // 1. 保存本次业务数据变更。
    return this.prisma.productCategory.update({ where: { id }, data })
  }

  // 按 ID 查询商品及展示所需关联信息。
  findById(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.product.findUnique({
      where: { id },
      include,
    })
  }

  // 读取商品及全部规格，供编辑校验。
  findWithSpecs(
    // 当前操作的记录编号。
    id: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.product.findUnique({
      where: { id },
      include: {
        specs: true,
      },
    })
  }

  // 按 ID 查询商品分类。
  findCategoryById(
    // 商品分类编号。
    categoryId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.productCategory.findUnique({
      where: { id: categoryId },
    })
  }

  // 创建平台商品。
  createProduct(
    // 待保存或处理的数据。
    data: Prisma.ProductUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.product.create({ data })
  }

  // 更新平台商品。
  updateProduct(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.ProductUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.product.update({ where: { id }, data })
  }

  // 按 ID 更新商品规格。
  updateSpec(
    // 商品规格编号。
    specId: number,
    // 待保存或处理的数据。
    data: Prisma.ProductSpecUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.productSpec.update({
      where: { id: specId },
      data,
    })
  }

  // 创建商品规格。
  createSpec(
    // 待保存或处理的数据。
    data: Prisma.ProductSpecUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.productSpec.create({
      data,
    })
  }

  // 按 ID 读取商品，不存在时抛出异常。
  getById(
    // 已保存的记录编号。
    savedId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.product.findUniqueOrThrow({
      where: { id: savedId },
      include,
    })
  }

  // 更新商品启用状态并返回展示字段。
  updateStatus(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.ProductUncheckedUpdateInput,
  ) {
    // 1. 保存本次业务数据变更。
    return this.prisma.product.update({
      where: { id },
      data,
      include,
    })
  }
  // 在传入事务中按筛选条件分页查询商品及总数。
  async findPage(
    // 列表查询条件。
    query: ProductQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 准备去除空白后的搜索关键词。
    const keyword = query.keyword?.trim()
    // 2. 整理数据库查询条件。
    const where: Prisma.ProductWhereInput = {
      enabled: query.enabled,
      type: query.type,
      categoryId: query.categoryId,
      ...(keyword
        ? {
            name: { contains: keyword },
          }
        : {}),
    }
    // 3. 返回本次处理结果。
    return [
      await tx.product.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
      }),
      await tx.product.count({ where }),
    ] as const
  }
}
