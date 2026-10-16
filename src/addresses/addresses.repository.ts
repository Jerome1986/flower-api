import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
export const select = {
  id: true,
  name: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  regionCode: true,
  detail: true,
  isDefault: true,
} as const

@Injectable()
export class AddressesRepository {
  // 注入数据库连接，集中处理收货地址数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 查询用户是否可用。
  findUser(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { enabled: true },
    })
  }

  // 查询用户的收货地址列表。
  findByUserId(userId: number) {
    return this.prisma.userAddress.findMany({
      where: { userId },
      select,
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    })
  }

  // 锁定用户记录，串行处理该用户的默认地址变更。
  lockUser(userId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.$queryRaw<Array<{ id: number; enabled: boolean | number }>>(
      Prisma.sql(
        ['SELECT id, enabled FROM user WHERE id = ', ' FOR UPDATE'],
        userId,
      ),
    )
  }

  // 按地址和用户 ID 查询所属地址。
  findOwnedAddress(id: number, userId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.userAddress.findFirst({
      where: { id, userId },
      select,
    })
  }

  // 按 ID 排序读取用户地址，供默认地址选择。
  findDefaultCandidates(userId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.userAddress.findMany({
      where: { userId },
      select: { id: true, isDefault: true },
      orderBy: { id: 'asc' },
    })
  }

  // 清除该用户其他地址的默认标记。
  clearOtherDefaults(
    userId: number,
    chosenId: number,
    data: Prisma.UserAddressUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.userAddress.updateMany({
      where: { userId, isDefault: true, id: { not: chosenId } },
      data,
    })
  }

  // 将用户选定的地址设为默认。
  setDefault(
    userId: number,
    chosenId: number,
    data: Prisma.UserAddressUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.userAddress.updateMany({
      where: { userId, id: chosenId, isDefault: false },
      data,
    })
  }

  // 创建用户收货地址。
  createAddress(
    data: Prisma.UserAddressUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.userAddress.create({
      data,
      select,
    })
  }

  // 按用户归属更新收货地址。
  updateAddress(
    id: number,
    userId: number,
    data: Prisma.UserAddressUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.userAddress.updateMany({
      where: { id, userId },
      data,
    })
  }

  // 按用户归属删除收货地址。
  deleteAddress(id: number, userId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.userAddress.deleteMany({ where: { id, userId } })
  }
}
