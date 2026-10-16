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
type ProductDetail = Prisma.ProductGetPayload<{ include: typeof include }>

@Injectable()
export class ProductService {
  // 注入商品数据访问层及业务依赖。
  constructor(
    private readonly repo: ProductRepository,
    private readonly prisma: PrismaService,
  ) {}

  // 整理商品响应字段。
  private serialize(product: ProductDetail) {
    const { code: _code, ...fields } = product
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
    return this.repo.findCategories()
  }

  // 校验并保存商品分类。
  async saveCategory(dto: SaveProductCategoryDto, id?: number) {
    const data = { ...dto, name: dto.name.trim() }
    if (!data.name) throw new BadRequestException('分类名称不能为空')
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
  async list(query: ProductQueryDto) {
    const [list, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => this.repo.findPage(query, tx),
    )
    return {
      list: list.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 查询商品详情。
  async detail(id: number) {
    const product = await this.repo.findById(id)
    if (!product) throw new NotFoundException('商品不存在')
    return this.serialize(product)
  }

  // 保存商品。
  async save(dto: SaveProductDto, id?: number) {
    if (!dto.name.trim() || !dto.coverImage.trim())
      throw new BadRequestException('商品名称和封面不能为空')
    const names = dto.specs.map((spec) => spec.name.trim())
    const ids = dto.specs.flatMap((spec) =>
      spec.id === undefined ? [] : [spec.id],
    )
    if (
      names.some((name) => !name) ||
      dto.specs.some((spec) => !spec.unit.trim()) ||
      new Set(names).size !== names.length ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException('规格名称、单位不能为空，规格不能重复')
    try {
      const product = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
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
            const category = await this.repo.findCategoryById(
              dto.categoryId,
              tx,
            )
            if (!category) throw new BadRequestException('商品分类不存在')
            if (!category.enabled && old?.categoryId !== dto.categoryId)
              throw new BadRequestException('不能选择已停用的商品分类')
          }
          const { specs, ...base } = dto
          const data = {
            ...base,
            name: dto.name.trim(),
            categoryId: dto.categoryId ?? null,
          }
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
          const finalNames = new Set(names)
          for (const spec of old?.specs ?? []) {
            if (ids.includes(spec.id)) continue
            if (finalNames.has(spec.name))
              throw new ConflictException(
                '请编辑原规格，不能删除后新增同名规格',
              )
            await this.repo.updateSpec(spec.id, { name: spec.name }, tx)
          }
          for (const spec of specs) {
            const { id: specId, ...fields } = spec
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
  async status(id: number, enabled: boolean) {
    await this.detail(id)
    return this.serialize(await this.repo.updateStatus(id, { enabled }))
  }
}
