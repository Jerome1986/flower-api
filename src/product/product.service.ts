import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProductQueryDto,
  SaveProductDto,
  SaveProductCategoryDto,
} from './product.dto';
import { randomUUID } from 'node:crypto';

const include = {
  category: true,
  specs: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
};
type ProductDetail = Prisma.ProductGetPayload<{ include: typeof include }>;

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(product: ProductDetail) {
    const { code: _code, ...fields } = product;
    return {
      ...fields,
      specs: product.specs.map((spec) => ({
        ...spec,
        price: Math.round(Number(spec.price) * 100),
      })),
    };
  }

  categories() {
    return this.prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async saveCategory(dto: SaveProductCategoryDto, id?: number) {
    const data = { ...dto, name: dto.name.trim() };
    if (!data.name) throw new BadRequestException('分类名称不能为空');
    try {
      return id === undefined
        ? await this.prisma.productCategory.create({ data })
        : await this.prisma.productCategory.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException('分类名称已存在');
        if (error.code === 'P2025')
          throw new NotFoundException('商品分类不存在');
      }
      throw error;
    }
  }

  async list(query: ProductQueryDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.ProductWhereInput = {
      enabled: query.enabled,
      categoryId: query.categoryId,
      ...(keyword
        ? {
            name: { contains: keyword },
          }
        : {}),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      list: list.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async detail(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include,
    });
    if (!product) throw new NotFoundException('商品不存在');
    return this.serialize(product);
  }

  async save(dto: SaveProductDto, id?: number) {
    if (!dto.name.trim() || !dto.coverImage.trim())
      throw new BadRequestException('商品名称和封面不能为空');
    const names = dto.specs.map((spec) => spec.name.trim());
    const ids = dto.specs.flatMap((spec) =>
      spec.id === undefined ? [] : [spec.id],
    );
    if (
      names.some((name) => !name) ||
      dto.specs.some((spec) => !spec.unit.trim()) ||
      new Set(names).size !== names.length ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException('规格名称、单位不能为空，规格不能重复');
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const old =
          id === undefined
            ? null
            : await tx.product.findUnique({
                where: { id },
                include: {
                  specs: true,
                },
              });
        if (id !== undefined && !old) throw new NotFoundException('商品不存在');
        if (
          ids.some((specId) => !old?.specs.some((spec) => spec.id === specId))
        )
          throw new BadRequestException('规格不属于当前商品');
        if (dto.categoryId) {
          const category = await tx.productCategory.findUnique({
            where: { id: dto.categoryId },
          });
          if (!category) throw new BadRequestException('商品分类不存在');
          if (!category.enabled && old?.categoryId !== dto.categoryId)
            throw new BadRequestException('不能选择已停用的商品分类');
        }
        const { specs, ...base } = dto;
        const data = {
          ...base,
          name: dto.name.trim(),
          categoryId: dto.categoryId ?? null,
        };
        const saved =
          id === undefined
            ? // 兼容现有数据库非空唯一列，仅内部自动生成，不作为业务字段开放。
              await tx.product.create({ data: { ...data, code: randomUUID() } })
            : await tx.product.update({ where: { id }, data });
        // 先临时改名，支持交换规格名称；历史规格只停用，不删除引用记录。
        for (const spec of old?.specs ?? []) {
          await tx.productSpec.update({
            where: { id: spec.id },
            data: { name: `__reserved_${randomUUID()}`, enabled: false },
          });
        }
        const finalNames = new Set(names);
        for (const spec of old?.specs ?? []) {
          if (ids.includes(spec.id)) continue;
          if (finalNames.has(spec.name))
            throw new ConflictException('请编辑原规格，不能删除后新增同名规格');
          await tx.productSpec.update({
            where: { id: spec.id },
            data: { name: spec.name },
          });
        }
        for (const spec of specs) {
          const { id: specId, ...fields } = spec;
          const specData = {
            ...fields,
            name: spec.name.trim(),
            unit: spec.unit.trim(),
            stemsPerUnit: spec.stemsPerUnit ?? null,
            price: new Prisma.Decimal(spec.price).div(100),
          };
          if (specId)
            await tx.productSpec.update({
              where: { id: specId },
              data: specData,
            });
          else
            await tx.productSpec.create({
              data: { ...specData, productId: saved.id },
            });
        }
        return tx.product.findUniqueOrThrow({
          where: { id: saved.id },
          include,
        });
      });
      return this.serialize(product);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('商品保存冲突，请检查规格名称后重试');
      throw error;
    }
  }

  async status(id: number, enabled: boolean) {
    await this.detail(id);
    return this.serialize(
      await this.prisma.product.update({
        where: { id },
        data: { enabled },
        include,
      }),
    );
  }
}
