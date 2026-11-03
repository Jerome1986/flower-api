import { PrismaService } from '../prisma/prisma.service'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { ProductQueryDto } from './dto/product-query.dto'
import { SaveProductCategoryDto } from './dto/save-product-category.dto'
import { SaveProductDto } from './dto/save-product.dto'
import { ProductRepository } from './product.repository'

import { include } from './product.repository'
// 商品业务数据类型。
type ProductDetail = Prisma.ProductGetPayload<{
  // 关联查询配置。
  include: typeof include
}>

// 商品业务服务。
@Injectable()
export class ProductService {
  // 注入商品数据访问层及业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: ProductRepository,
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 整理商品响应字段。
  private serialize(
    // 商品信息。
    product: ProductDetail,
  ) {
    // 1. 准备仅内部使用的商品编码、待处理的业务字段。
    const { code: _code, ...fields } = product
    // 2. 返回本次处理结果。
    return {
      ...fields,
      specs: product.specs.map((spec) => ({
        ...spec,
        price: Math.round(Number(spec.price) * 100),
      })),
    }
  }

  // 查询商品分类列表。
  categories() {
    // 1. 返回本次处理结果。
    return this.repo.findCategories()
  }

  // 校验并保存商品分类。
  async saveCategory(
    // 接口请求参数。
    dto: SaveProductCategoryDto,
    // 当前操作的记录编号。
    id?: number,
  ) {
    // 1. 整理待保存或处理的数据。
    const data = { ...dto, name: dto.name.trim() }
    // 2. 不满足要求时提示：分类名称不能为空。
    if (!data.name) throw new BadRequestException('分类名称不能为空')
    // 3. 执行业务处理，将失败原因交由异常分支处理。
    try {
      return id === undefined
        ? await this.repo.createCategory(data)
        : await this.repo.updateCategory(id, data)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException('分类名称已存在')
        if (error.code === 'P2025')
          throw new NotFoundException('商品分类不存在')
      }
      throw error
    }
  }

  // 查询商品列表。
  async list(
    // 列表查询条件。
    query: ProductQueryDto,
  ) {
    // 1. 查询当前页的数据列表、汇总总数或总金额。
    const [list, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => this.repo.findPage(query, tx),
    )
    // 2. 返回本次处理结果。
    return {
      list: list.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 查询商品详情。
  async detail(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 查询商品信息。
    const product = await this.repo.findById(id)
    // 2. 不满足要求时提示：商品不存在。
    if (!product) throw new NotFoundException('商品不存在')
    // 3. 整理商品响应字段。
    return this.serialize(product)
  }

  // 保存商品。
  async save(
    // 接口请求参数。
    dto: SaveProductDto,
    // 当前操作的记录编号。
    id?: number,
  ) {
    // 1. 不满足要求时提示：商品名称和封面不能为空。
    if (!dto.name.trim() || !dto.coverImage.trim())
      throw new BadRequestException('商品名称和封面不能为空')
    // 2. 准备名称列表。
    const names = dto.specs.map((spec) => spec.name.trim())
    // 3. 准备业务记录编号列表。
    const ids = dto.specs.flatMap((spec) =>
      spec.id === undefined ? [] : [spec.id],
    )
    // 4. 不满足要求时提示：规格名称、单位不能为空。
    if (
      names.some((name) => !name) ||
      dto.specs.some((spec) => !spec.unit.trim()) ||
      new Set(names).size !== names.length ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException('规格名称、单位不能为空，规格不能重复')
    // 5. 执行业务处理，将失败原因交由异常分支处理。
    try {
      // 商品信息。
      const product = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // 修改前的记录。
          const old =
            id === undefined ? null : await this.repo.findWithSpecs(id, tx)
          if (id !== undefined && !old)
            throw new NotFoundException('商品不存在')
          if (old && dto.type && old.type !== dto.type)
            throw new BadRequestException('商品类型创建后不能修改，请新建商品')
          if (
            ids.some((specId) => !old?.specs.some((spec) => spec.id === specId))
          )
            throw new BadRequestException('规格不属于当前商品')
          if (dto.categoryId) {
            // 商品分类信息。
            const category = await this.repo.findCategoryById(
              dto.categoryId,
              tx,
            )
            if (!category) throw new BadRequestException('商品分类不存在')
            if (!category.enabled && old?.categoryId !== dto.categoryId)
              throw new BadRequestException('不能选择已停用的商品分类')
          }
          // 商品规格列表、基础业务字段。
          const { specs, ...base } = dto
          // 待保存或处理的数据。
          const data = {
            ...base,
            name: dto.name.trim(),
            categoryId: dto.categoryId ?? null,
          }
          // 已保存的记录。
          const saved =
            id === undefined
              ? // 兼容现有数据库非空唯一列，仅内部自动生成，不作为业务字段开放。
                await this.repo.createProduct(
                  { ...data, code: randomUUID() },
                  tx,
                )
              : await this.repo.updateProduct(id, data, tx)
          // 先临时改名，支持交换规格名称；历史规格只停用，不删除引用记录。
          for (const spec of old?.specs ?? []) {
            await this.repo.updateSpec(
              spec.id,
              { name: `__reserved_${randomUUID()}`, enabled: false },
              tx,
            )
          }
          // 保存后的规格名称集合。
          const finalNames = new Set(names)
          // 逐项处理：商品规格信息。
          for (const spec of old?.specs ?? []) {
            if (ids.includes(spec.id)) continue
            if (finalNames.has(spec.name))
              throw new ConflictException(
                '请编辑原规格，不能删除后新增同名规格',
              )
            await this.repo.updateSpec(spec.id, { name: spec.name }, tx)
          }
          // 逐项处理：商品规格信息。
          for (const spec of specs) {
            // 商品规格编号、待处理的业务字段。
            const { id: specId, ...fields } = spec
            // 待保存的商品规格字段。
            const specData = {
              ...fields,
              name: spec.name.trim(),
              unit: spec.unit.trim(),
              stemsPerUnit: spec.stemsPerUnit ?? null,
              price: new Prisma.Decimal(spec.price).div(100),
            }
            if (specId) await this.repo.updateSpec(specId, specData, tx)
            else
              await this.repo.createSpec(
                { ...specData, productId: saved.id },
                tx,
              )
          }
          return this.repo.getById(saved.id, tx)
        },
      )
      return this.serialize(product)
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('商品保存冲突，请检查规格名称后重试')
      throw error
    }
  }

  // 设置商品启用状态。
  async status(
    // 当前操作的记录编号。
    id: number,
    // 是否启用。
    enabled: boolean,
  ) {
    // 1. 查询商品详情。
    await this.detail(id)
    // 2. 整理商品响应字段。
    return this.serialize(await this.repo.updateStatus(id, { enabled }))
  }
}
