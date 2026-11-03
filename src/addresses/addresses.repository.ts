import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
// 查询返回的字段范围。
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

// 收货地址数据库访问。
@Injectable()
export class AddressesRepository {
  // 注入数据库连接，集中处理收货地址数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 查询用户是否可用。
  findUser(
    // 用户编号。
    userId: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { enabled: true },
    })
  }

  // 查询用户的收货地址列表。
  findByUserId(
    // 用户编号。
    userId: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.userAddress.findMany({
      where: { userId },
      select,
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    })
  }

  // 锁定用户记录，串行处理该用户的默认地址变更。
  lockUser(
    // 用户编号。
    userId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.$queryRaw<
      Array<{
        // 记录编号。
        id: number
        // 是否启用。
        enabled: boolean | number
      }>
    >(
      Prisma.sql(
        ['SELECT id, enabled FROM user WHERE id = ', ' FOR UPDATE'],
        userId,
      ),
    )
  }

  // 按地址和用户 ID 查询所属地址。
  findOwnedAddress(
    // 当前操作的记录编号。
    id: number,
    // 用户编号。
    userId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.userAddress.findFirst({
      where: { id, userId },
      select,
    })
  }

  // 按 ID 排序读取用户地址，供默认地址选择。
  findDefaultCandidates(
    // 用户编号。
    userId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.userAddress.findMany({
      where: { userId },
      select: { id: true, isDefault: true },
      orderBy: { id: 'asc' },
    })
  }

  // 清除该用户其他地址的默认标记。
  clearOtherDefaults(
    // 用户编号。
    userId: number,
    // 选中的记录编号。
    chosenId: number,
    // 待保存或处理的数据。
    data: Prisma.UserAddressUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.userAddress.updateMany({
      where: { userId, isDefault: true, id: { not: chosenId } },
      data,
    })
  }

  // 将用户选定的地址设为默认。
  setDefault(
    // 用户编号。
    userId: number,
    // 选中的记录编号。
    chosenId: number,
    // 待保存或处理的数据。
    data: Prisma.UserAddressUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.userAddress.updateMany({
      where: { userId, id: chosenId, isDefault: false },
      data,
    })
  }

  // 创建用户收货地址。
  createAddress(
    // 待保存或处理的数据。
    data: Prisma.UserAddressUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.userAddress.create({
      data,
      select,
    })
  }

  // 按用户归属更新收货地址。
  updateAddress(
    // 当前操作的记录编号。
    id: number,
    // 用户编号。
    userId: number,
    // 待保存或处理的数据。
    data: Prisma.UserAddressUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.userAddress.updateMany({
      where: { id, userId },
      data,
    })
  }

  // 按用户归属删除收货地址。
  deleteAddress(
    // 当前操作的记录编号。
    id: number,
    // 用户编号。
    userId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.userAddress.deleteMany({ where: { id, userId } })
  }
}
