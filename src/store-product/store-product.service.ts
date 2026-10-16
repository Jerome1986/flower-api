import { PrismaService } from '../prisma/prisma.service'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CurrentAdmin } from '../common/guards/admin-auth.guard'
import type { StoreAccess } from '../common/types/store-access'
import { AdjustStockDto } from './dto/adjust-stock.dto'
import { CatalogQueryDto } from './dto/catalog-query.dto'
import { SelectStoreProductDto } from './dto/select-store-product.dto'
import { StoreProductQueryDto } from './dto/store-product-query.dto'
import { StoreProductSettingsDto } from './dto/store-product-settings.dto'
import { StoreProductRepository } from './store-product.repository'

import { include } from './store-product.repository'
type SelectedProduct = Prisma.StoreProductGetPayload<{
  include: typeof include
}>

@Injectable()
export class StoreProductService {
  // 注入门店商品数据访问层及业务依赖。
  constructor(
    private readonly repo: StoreProductRepository,
    private readonly prisma: PrismaService,
  ) {}

  // 根据账号身份限定门店商品查询范围。
  private scope(admin: CurrentAdmin): StoreAccess {
    if (admin.role === 'SUPER_ADMIN' || admin.role === 'PLATFORM_ADMIN')
      return {}
    // 直接通过当前门店关联检查店长权限，不信任客户端提交的门店范围。
    if (admin.role === 'STORE_MANAGER') return { managerId: admin.id }
    if (admin.role === 'STORE_ADMIN' && admin.storeId)
      return { storeId: admin.storeId }
    throw new ForbiddenException('无门店商品管理权限')
  }

  // 查询可用门店详情。
  private async store(
    storeId: number,
    admin: CurrentAdmin,
    tx?: Prisma.TransactionClient,
  ) {
    const store = await this.repo.findStore(storeId, this.scope(admin), tx)
    if (!store) throw new NotFoundException('门店不存在或无访问权限')
    return store
  }

  // 按商品 ID 和管理员可见门店范围查询上架记录。
  private async selected(
    id: number,
    admin: CurrentAdmin,
    tx?: Prisma.TransactionClient,
  ) {
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647)
      throw new BadRequestException('请选择有效的门店商品')
    const item = await this.repo.findById(id, this.scope(admin), tx)
    if (!item) throw new NotFoundException('门店商品不存在或无访问权限')
    return item
  }

  // 整理门店商品响应字段。
  private serialize(item: SelectedProduct) {
    return {
      id: item.id,
      storeId: item.storeId,
      productId: item.productId,
      enabled: item.enabled,
      pickupEnabled: item.pickupEnabled,
      deliveryEnabled: item.deliveryEnabled,
      store: item.store,
      product: {
        id: item.product.id,
        name: item.product.name,
        coverImage: item.product.coverImage,
        enabled: item.product.enabled,
        category: item.product.category
          ? { id: item.product.category.id, name: item.product.category.name }
          : null,
      },
      specs: item.product.specs.map((spec) => {
        const stock = item.stocks.find((stock) => stock.specId === spec.id)
        return {
          id: spec.id,
          name: spec.name,
          unit: spec.unit,
          price: Math.round(Number(spec.price) * 100),
          stemsPerUnit: spec.stemsPerUnit,
          enabled: spec.enabled,
          stockId: stock?.id ?? null,
          available: stock?.available ?? 0,
          reserved: stock?.reserved ?? 0,
          version: stock?.version ?? 0,
        }
      }),
    }
  }

  // 按平台、店长或旧门店账号的权限返回可管理门店。
  stores(admin: CurrentAdmin) {
    return this.repo.findStores(this.scope(admin))
  }

  // 在授权门店范围内分页查询已选商品，并合并规格与库存数据。
  async list(query: StoreProductQueryDto, admin: CurrentAdmin) {
    const scope = this.scope(admin)
    if (query.storeId) await this.store(query.storeId, admin)

    const [items, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        this.repo.findPage(scope, query, tx),
    )
    return {
      list: items.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 查询可选的已上架商品及启用规格，标记当前门店是否已添加。
  async catalog(query: CatalogQueryDto, admin: CurrentAdmin) {
    if (!query.storeId) throw new BadRequestException('请选择门店')
    await this.store(query.storeId, admin)

    const [items, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        this.repo.findCatalogPage(query, tx),
    )
    return {
      list: items.map((item) => ({
        id: item.id,
        name: item.name,
        coverImage: item.coverImage,
        category: item.category
          ? { id: item.category.id, name: item.category.name }
          : null,
        selected: item.storeProducts.length > 0,
        specs: item.specs.map((spec) => ({
          id: spec.id,
          name: spec.name,
          unit: spec.unit,
          price: Math.round(Number(spec.price) * 100),
        })),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 校验门店访问权限后返回商品设置和最新规格库存。
  async detail(id: number, admin: CurrentAdmin) {
    return this.serialize(await this.selected(id, admin))
  }

  // 检查上架商品是否至少支持一种收花方式。
  private validateSettings(dto: StoreProductSettingsDto) {
    if (dto.enabled && !dto.pickupEnabled && !dto.deliveryEnabled)
      throw new BadRequestException('上架商品请至少选择一种取货方式')
  }

  // 在同一事务中创建门店选品及规格零库存，拒绝重复选品。
  async create(dto: SelectStoreProductDto, admin: CurrentAdmin) {
    this.validateSettings(dto)
    try {
      const item = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const store = await this.store(dto.storeId, admin, tx)
          if (!store.enabled)
            throw new BadRequestException('门店已停用，不能添加商品')
          const product = await this.repo.findProductWithSpecs(
            dto.productId,
            tx,
          )
          if (
            !product?.enabled ||
            product.type !== 'ORDINARY' ||
            !product.specs.length
          )
            throw new BadRequestException('请选择已上架且有可用规格的商品')
          const selected = await this.repo.createProduct(
            {
              storeId: dto.storeId,
              productId: dto.productId,
              enabled: dto.enabled,
              pickupEnabled: dto.pickupEnabled,
              deliveryEnabled: dto.deliveryEnabled,
            },
            tx,
          )
          await this.repo.createStocks(
            product.specs.map((spec) => ({
              storeProductId: selected.id,
              productId: product.id,
              specId: spec.id,
            })),
            tx,
          )
          return this.selected(selected.id, admin, tx)
        },
      )
      return this.serialize(item)
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('本店已添加该商品，请在列表中维护')
      throw error
    }
  }

  // 校验商品可售状态和取货方式后保存本店上下架设置。
  async update(id: number, dto: StoreProductSettingsDto, admin: CurrentAdmin) {
    this.validateSettings(dto)
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const old = await this.selected(id, admin, tx)
      if (
        dto.enabled &&
        (!old.store.enabled ||
          !old.product.enabled ||
          !old.product.specs.some((spec) => spec.enabled))
      )
        throw new BadRequestException(
          '门店或商品已停用，或没有可用规格，暂不能上架',
        )
      return this.serialize(await this.repo.updateProduct(id, dto, tx))
    })
  }

  // 使用版本校验和幂等标识调整可售库存，事务内同步写入库存流水。
  async adjust(
    id: number,
    specId: number,
    dto: AdjustStockDto,
    admin: CurrentAdmin,
  ) {
    if (!Number.isInteger(specId) || specId <= 0 || specId > 2147483647)
      throw new BadRequestException('请选择有效的商品规格')
    if (!dto.reason.trim()) throw new BadRequestException('请填写库存调整原因')
    const operationKey = `inventory:${admin.role}:${admin.id}:${dto.operationKey}`
    const reason = dto.reason.trim()
    // 核对幂等请求是否与已记录的商品、规格、库存和原因一致。
    const matches = (log: {
      availableAfter: number
      reason: string
      stock: { storeProductId: number; specId: number }
    }) =>
      log.stock.storeProductId === id &&
      log.stock.specId === specId &&
      log.availableAfter === dto.available &&
      log.reason === reason
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const item = await this.selected(id, admin, tx)
        if (!item.product.specs.some((spec) => spec.id === specId))
          throw new BadRequestException('规格不属于当前商品')
        const prior = await this.repo.findInventoryLog(operationKey, tx)
        if (prior) {
          if (!matches(prior))
            throw new ConflictException('本次调整已提交，请刷新后重新操作')
          return
        }
        // 商品库后续新增的规格在第一次调整时补建库存，不更改已有库存。
        await this.repo.createMissingStocks(
          [{ storeProductId: id, productId: item.productId, specId }],
          tx,
        )
        const stock = await this.repo.getStock(id, specId, tx)
        const updated = await this.repo.updateStock(
          stock.id,
          dto.version,
          stock.available,
          stock.reserved,
          { available: dto.available, version: { increment: 1 } },
          tx,
        )
        if (updated.count !== 1)
          throw new ConflictException('库存已发生变化，请刷新后重新调整')
        await this.repo.createInventoryLog(
          {
            stockId: stock.id,
            type: 'STOCKTAKE',
            availableBefore: stock.available,
            availableAfter: dto.available,
            reservedBefore: stock.reserved,
            reservedAfter: stock.reserved,
            reason,
            adminId: admin.role === 'STORE_MANAGER' ? null : admin.id,
            operationKey,
          },
          tx,
        )
      })
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error
      // 并发重复提交时唯一键回滚整个事务，确认原操作一致后返回最新库存。
      const prior = await this.repo.findInventoryLog(operationKey)
      if (!prior || !matches(prior))
        throw new ConflictException('库存调整冲突，请刷新后重试')
    }
    return this.detail(id, admin)
  }

  // 校验商品所属门店权限后分页返回库存变动及操作人信息。
  async logs(id: number, query: StoreProductQueryDto, admin: CurrentAdmin) {
    await this.selected(id, admin)

    const [items, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        this.repo.findLogsPage(id, query, tx),
    )
    return {
      list: items.map((log) => ({
        id: log.id,
        type: log.type,
        specName: log.stock.spec.name,
        unit: log.stock.spec.unit,
        availableBefore: log.availableBefore,
        availableAfter: log.availableAfter,
        reservedBefore: log.reservedBefore,
        reservedAfter: log.reservedAfter,
        reason: log.reason,
        operator:
          log.admin?.username ??
          (log.operationKey.startsWith('inventory:STORE_MANAGER:')
            ? '店长'
            : '系统'),
        createdAt: log.createdAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }
}
