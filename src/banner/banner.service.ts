import { PrismaService } from '../prisma/prisma.service'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CurrentAdmin } from '../common/guards/admin-auth.guard'
import { BannerRepository } from './banner.repository'
import { BannerDto } from './dto/banner.dto'
import { SaveBannersDto } from './dto/save-banners.dto'

@Injectable()
export class BannerService {
  // 注入数据访问层，复用平台首页配置保存轮播图。
  constructor(
    private readonly repo: BannerRepository,
    private readonly prisma: PrismaService,
  ) {
    // 1. 复用全局数据库连接，无需新增表。
  }

  // 校验轮播图管理权限。
  private authorize(admin: CurrentAdmin) {
    // 1. 仅平台管理员和超级管理员可以设置首页轮播图。
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可设置轮播图')
  }

  // 获取已有首页内容对象，保留与轮播图无关的配置。
  private content(value: Prisma.JsonValue | null): Prisma.JsonObject {
    // 1. 未配置时使用空对象，已有非对象内容拒绝覆盖。
    if (value === null) return {}
    if (typeof value !== 'object' || Array.isArray(value))
      throw new ConflictException('首页配置格式不兼容，请联系管理员处理')
    return value
  }

  // 校验轮播图字段，避免保存不可用的图片地址。
  private valid(item: unknown): item is BannerDto {
    // 1. 校验完整展示字段及可加载的 HTTP 或站内图片地址。
    if (!item || typeof item !== 'object') return false
    const row = item as BannerDto
    return (
      typeof row.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        row.id,
      ) &&
      typeof row.title === 'string' &&
      row.title.trim().length > 0 &&
      row.title.length <= 100 &&
      typeof row.image === 'string' &&
      row.image.length <= 1024 &&
      /^(https?:\/\/[^\s]+|\/(?!\/)[^\s]+)$/.test(row.image) &&
      typeof row.enabled === 'boolean' &&
      Number.isInteger(row.sortOrder) &&
      row.sortOrder >= 0 &&
      row.sortOrder <= 2147483647
    )
  }

  // 读取并排序轮播图，统一响应字段。
  private banners(content: Prisma.JsonObject) {
    // 1. 仅读取轮播图配置，校验后输出明确字段。
    if (content.banners === undefined) return []
    if (
      !Array.isArray(content.banners) ||
      !content.banners.every((item) => this.valid(item))
    )
      throw new ConflictException('轮播图配置格式异常，请联系管理员处理')
    return (content.banners as unknown as BannerDto[])
      .map((item) => ({
        id: item.id,
        title: item.title,
        image: item.image,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  }

  // 查询后台完整轮播图配置和编辑版本。
  async list(admin: CurrentAdmin) {
    // 1. 校验权限并读取平台单例配置。
    this.authorize(admin)
    const config = await this.repo.findConfig()
    // 2. 返回全部轮播图及更新时间，供编辑和并发校验。
    return {
      banners: this.banners(this.content(config?.homeContent ?? null)),
      updatedAt: config?.updatedAt ?? null,
    }
  }

  // 保存轮播图列表，保留定制服务及其他首页配置。
  async save(dto: SaveBannersDto, admin: CurrentAdmin) {
    // 1. 校验权限、数量、唯一标识和图片地址。
    this.authorize(admin)
    if (
      !Array.isArray(dto.banners) ||
      dto.banners.length > 20 ||
      !dto.banners.every((item) => this.valid(item)) ||
      new Set(dto.banners.map((item) => item.id)).size !== dto.banners.length
    )
      throw new BadRequestException(
        '请填写有效的轮播图标题、图片和排序，最多20张',
      )
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // 2. 校验编辑版本，避免覆盖其他管理员刚保存的配置。
          const old = await this.repo.findConfig(tx)
          if ((old?.updatedAt.toISOString() ?? null) !== dto.updatedAt)
            throw new ConflictException('配置已被修改，请重新加载后再保存')
          // 3. 只替换 banners 字段，不覆盖定制服务或其他首页内容。
          const homeContent = {
            ...this.content(old?.homeContent ?? null),
            banners: dto.banners.map((item) => ({
              id: item.id,
              title: item.title.trim(),
              image: item.image,
              enabled: item.enabled,
              sortOrder: item.sortOrder,
            })),
          }
          const updatedAt = new Date(
            Math.max(Date.now(), (old?.updatedAt.getTime() ?? 0) + 1),
          )
          const saved = await this.repo.saveConfig(
            { id: 1, homeContent, updatedAt },
            { homeContent, updatedAt },
            tx,
          )
          // 4. 返回保存后的图片和新版本，支持继续编辑。
          return {
            banners: this.banners(this.content(saved.homeContent)),
            updatedAt: saved.updatedAt,
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      // 5. 并发冲突提示重新加载，防止静默覆盖。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code)
      )
        throw new ConflictException('配置已被修改，请重新加载后再保存')
      throw error
    }
  }

  // 提供首页可展示的启用轮播图，不暴露其他平台配置。
  async publicList() {
    // 1. 读取并排序首页轮播图。
    const config = await this.repo.findConfig()
    // 2. 只输出已启用的图片和标题。
    return this.banners(this.content(config?.homeContent ?? null))
      .filter((item) => item.enabled)
      .map(({ id, title, image, sortOrder }) => ({
        id,
        title,
        image,
        sortOrder,
      }))
  }
}
