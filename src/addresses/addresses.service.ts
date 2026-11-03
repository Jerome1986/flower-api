import { PrismaService } from '../prisma/prisma.service'
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AddressesRepository } from './addresses.repository'
import { SaveAddressDto } from './dto/save-address.dto'
// 收货地址业务服务。
@Injectable()
export class AddressesService {
  // 注入收货地址数据访问层及业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: AddressesRepository,
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 查询收货地址列表。
  async list(
    // 用户编号。
    userId: number,
  ) {
    // 1. 查询当前用户信息。
    const user = await this.repo.findUser(userId)
    // 2. 不满足要求时提示：账号不可用。
    if (!user?.enabled)
      throw new UnauthorizedException('账号不可用，请重新登录')
    // 3. 返回本次处理结果。
    return this.repo.findByUserId(userId)
  }

  // 锁定父用户行，串行化包括首次创建在内的全部地址写入，无需变更表结构。
  private async write<T>(
    // 用户编号。
    userId: number,
    // 待执行的业务操作。
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // 1. 死锁或事务冲突最多重试三次，每次重新读取并锁定用户。
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            // 2. 锁定父用户行，防止并发创建地址时出现多个默认项。
            const rows = await this.repo.lockUser(userId, tx)
            if (!rows[0]?.enabled)
              throw new UnauthorizedException('账号不可用，请重新登录')
            // 3. 在持锁事务中完成归属校验、地址修改和默认地址归一化。
            return action(tx)
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        )
      } catch (error) {
        if (
          (
            error as {
              // 业务编号或错误码。
              code?: string
            }
          ).code !== 'P2034'
        )
          throw error
        if (attempt === 2) throw new ConflictException('地址正在更新，请重试')
      }
    }
    throw new ConflictException('地址正在更新，请重试')
  }

  // 校验收货地址是否属于当前用户。
  private async owned(
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
    // 用户编号。
    userId: number,
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 查询收货地址信息。
    const address = await this.repo.findOwnedAddress(id, userId, tx)
    // 2. 不满足要求时提示：地址不存在。
    if (!address) throw new NotFoundException('地址不存在')
    // 3. 返回本次处理结果。
    return address
  }

  // 非空地址簿恰有一个默认地址；取消当前默认时优先选择其他最早地址。
  private async normalizeDefault(
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
    // 用户编号。
    userId: number,
    // 优先选用的记录编号。
    preferredId?: number,
    // 需要避开的记录编号。
    avoidId?: number,
  ) {
    // 1. 按创建顺序读取地址，优先使用指定项，其次保留其他默认项。
    const list = await this.repo.findDefaultCandidates(userId, tx)
    // 选中的默认地址。
    const chosen =
      list.find((item) => item.id === preferredId) ||
      list.find((item) => item.isDefault && item.id !== avoidId) ||
      list.find((item) => item.id !== avoidId) ||
      list[0]
    if (!chosen) return
    // 2. 在同一事务中清除其他默认标记，再设置选中的地址。
    await this.repo.clearOtherDefaults(
      userId,
      chosen.id,
      { isDefault: false },
      tx,
    )
    await this.repo.setDefault(userId, chosen.id, { isDefault: true }, tx)
  }

  // 提取收货地址写入字段。
  private data(
    // 接口请求参数。
    dto: SaveAddressDto,
  ) {
    // 1. 返回本次处理结果。
    return {
      name: dto.name,
      phone: dto.phone,
      province: dto.province,
      city: dto.city,
      district: dto.district,
      regionCode: dto.regionCode || null,
      detail: dto.detail,
      isDefault: dto.isDefault,
    }
  }

  // 新增收货地址。
  create(
    // 用户编号。
    userId: number,
    // 接口请求参数。
    dto: SaveAddressDto,
  ) {
    // 1. 锁定父用户行，串行化包括首次创建在内的全部地址写入，无需变更表结构。
    return this.write(userId, async (tx: Prisma.TransactionClient) => {
      // 当前业务明细。
      const item = await this.repo.createAddress(
        { ...this.data(dto), userId },
        tx,
      )
      await this.normalizeDefault(
        tx,
        userId,
        dto.isDefault ? item.id : undefined,
      )
      return this.owned(tx, userId, item.id)
    })
  }

  // 更新收货地址。
  update(
    // 用户编号。
    userId: number,
    // 当前操作的记录编号。
    id: number,
    // 接口请求参数。
    dto: SaveAddressDto,
  ) {
    // 1. 锁定父用户行，串行化包括首次创建在内的全部地址写入，无需变更表结构。
    return this.write(userId, async (tx: Prisma.TransactionClient) => {
      await this.owned(tx, userId, id)
      await this.repo.updateAddress(id, userId, this.data(dto), tx)
      await this.normalizeDefault(
        tx,
        userId,
        dto.isDefault ? id : undefined,
        dto.isDefault ? undefined : id,
      )
      return this.owned(tx, userId, id)
    })
  }

  // 删除收货地址。
  remove(
    // 用户编号。
    userId: number,
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 锁定父用户行，串行化包括首次创建在内的全部地址写入，无需变更表结构。
    return this.write(userId, async (tx: Prisma.TransactionClient) => {
      await this.owned(tx, userId, id)
      await this.repo.deleteAddress(id, userId, tx)
      await this.normalizeDefault(tx, userId)
      return { id }
    })
  }

  // 设置默认地址并保持地址簿仅有一个默认项。
  setDefault(
    // 用户编号。
    userId: number,
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 锁定父用户行，串行化包括首次创建在内的全部地址写入，无需变更表结构。
    return this.write(userId, async (tx: Prisma.TransactionClient) => {
      await this.owned(tx, userId, id)
      await this.normalizeDefault(tx, userId, id)
      return this.owned(tx, userId, id)
    })
  }
}
