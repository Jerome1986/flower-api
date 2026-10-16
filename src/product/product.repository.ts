import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ProductQueryDto } from './dto/product-query.dto'
export const include = {
  category: true,
  specs: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
}
type ProductDetail = Prisma.ProductGetPayload<{ include: typeof include }>
@Injectable()
export class ProductRepository {
  // 注入数据库连接，集中处理商品数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按排序值和 ID 查询商品分类。
  findCategories() {
    return this.prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
  }

  // 创建商品分类。
  createCategory(data: Prisma.ProductCategoryUncheckedCreateInput) {
    return this.prisma.productCategory.create({ data })
  }

  // 按 ID 更新商品分类。
  updateCategory(id: number, data: Prisma.ProductCategoryUncheckedUpdateInput) {
    return this.prisma.productCategory.update({ where: { id }, data })
  }

  // 按 ID 查询商品及展示所需关联信息。
  findById(id: number) {
    return this.prisma.product.findUnique({
      where: { id },
      include,
    })
  }

  // 读取商品及全部规格，供编辑校验。
  findWithSpecs(id: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.product.findUnique({
      where: { id },
      include: {
        specs: true,
      },
    })
  }

  // 按 ID 查询商品分类。
  findCategoryById(categoryId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.productCategory.findUnique({
      where: { id: categoryId },
    })
  }

  // 创建平台商品。
  createProduct(
    data: Prisma.ProductUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.product.create({ data })
  }

  // 更新平台商品。
  updateProduct(
    id: number,
    data: Prisma.ProductUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.product.update({ where: { id }, data })
  }

  // 按 ID 更新商品规格。
  updateSpec(
    specId: number,
    data: Prisma.ProductSpecUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.productSpec.update({
      where: { id: specId },
      data,
    })
  }

  // 创建商品规格。
  createSpec(
    data: Prisma.ProductSpecUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.productSpec.create({
      data,
    })
  }

  // 按 ID 读取商品，不存在时抛出异常。
  getById(savedId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.product.findUniqueOrThrow({
      where: { id: savedId },
      include,
    })
  }

  // 更新商品启用状态并返回展示字段。
  updateStatus(id: number, data: Prisma.ProductUncheckedUpdateInput) {
    return this.prisma.product.update({
      where: { id },
      data,
      include,
    })
  }
  // 在传入事务中按筛选条件分页查询商品及总数。
  async findPage(query: ProductQueryDto, tx: Prisma.TransactionClient) {
    const keyword = query.keyword?.trim()
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
