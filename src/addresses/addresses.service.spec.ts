import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AddressesRepository } from './addresses.repository'
import { AddressesService } from './addresses.service'
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))

describe('地址事务和归属', () => {
  let rows: any[]
  let nextId: number
  let enabled: boolean
  let db: any
  let service: AddressesService
  const input = {
    name: '花友',
    phone: '13800000000',
    province: '浙江省',
    city: '杭州市',
    district: '西湖区',
    detail: '花园路18号',
    isDefault: false,
  }
  function matches(row: any, where: any) {
    return Object.entries(where).every(([key, value]) =>
      typeof value === 'object' && value
        ? row[key] !== (value as any).not
        : row[key] === value,
    )
  }
  function project(row: any, select: any) {
    return row
      ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]))
      : null
  }
  beforeEach(() => {
    rows = []
    nextId = 1
    enabled = true
    db = {
      user: { findUnique: jest.fn(async () => ({ enabled })) },
      $queryRaw: jest.fn(async () => [{ id: 1, enabled }]),
      userAddress: {
        findMany: jest.fn(async ({ where, select, orderBy }) =>
          rows
            .filter((row) => matches(row, where))
            .sort((a, b) =>
              Array.isArray(orderBy)
                ? Number(b.isDefault) - Number(a.isDefault) || a.id - b.id
                : a.id - b.id,
            )
            .map((row) => project(row, select)),
        ),
        findFirst: jest.fn(async ({ where, select }) =>
          project(
            rows.find((row) => matches(row, where)),
            select,
          ),
        ),
        create: jest.fn(async ({ data, select }) => {
          const row = { id: nextId++, ...data }
          rows.push(row)
          return project(row, select)
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const found = rows.filter((row) => matches(row, where))
          found.forEach((row) => Object.assign(row, data))
          return { count: found.length }
        }),
        deleteMany: jest.fn(async ({ where }) => {
          rows = rows.filter((row) => !matches(row, where))
          return { count: 1 }
        }),
      },
      $transaction: jest.fn(async (fn) => {
        const snapshot = structuredClone(rows)
        try {
          return await fn(db)
        } catch (error) {
          rows = snapshot
          throw error
        }
      }),
    }
    service = new AddressesService(
      new AddressesRepository(db as PrismaService),
      db as PrismaService,
    )
  })
  it('首个地址自动默认，并且不返回用户归属字段', async () => {
    const saved = await service.create(1, input)
    expect(saved.isDefault).toBe(true)
    expect(saved).not.toHaveProperty('userId')
    const sql = db.$queryRaw.mock.calls[0][0]
    expect(sql.values).toEqual([1])
    expect(sql.sql).toContain('FOR UPDATE')
  })
  it('新增和切换默认保持唯一，重复设置同一默认地址可重试', async () => {
    const first = await service.create(1, input)
    const second = await service.create(1, { ...input, isDefault: true })
    expect((await service.list(1)).map((row) => row.id)).toEqual([
      second.id,
      first.id,
    ])
    await service.setDefault(1, first.id)
    await service.setDefault(1, first.id)
    expect(rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual([
      first.id,
    ])
  })
  it('取消当前默认优先选择其他地址，只有一条时保持默认', async () => {
    const first = await service.create(1, input)
    await service.update(1, first.id, input)
    expect(rows[0].isDefault).toBe(true)
    const second = await service.create(1, input)
    await service.update(1, first.id, { ...input, detail: '新地址' })
    expect(rows.find((row) => row.id === second.id).isDefault).toBe(true)
  })
  it('删除默认自动补位，最后一个删除后返回真实空列表', async () => {
    const first = await service.create(1, input)
    const second = await service.create(1, input)
    await service.remove(1, first.id)
    expect(rows[0]).toMatchObject({ id: second.id, isDefault: true })
    await service.remove(1, second.id)
    expect(await service.list(1)).toEqual([])
  })
  it('跨用户读写隔离，所有地址变更都拒绝他人 ID', async () => {
    const own = await service.create(1, input)
    const other = await service.create(2, input)
    expect((await service.list(1)).map((row) => row.id)).toEqual([own.id])
    const before = structuredClone(rows)
    await expect(service.update(1, other.id, input)).rejects.toThrow(
      NotFoundException,
    )
    await expect(service.remove(1, other.id)).rejects.toThrow(NotFoundException)
    await expect(service.setDefault(1, other.id)).rejects.toThrow(
      NotFoundException,
    )
    expect(rows).toEqual(before)
  })
  it('失效和停用账户拒绝查询与写入', async () => {
    enabled = false
    await expect(service.list(1)).rejects.toThrow(UnauthorizedException)
    await expect(service.create(1, input)).rejects.toThrow(
      UnauthorizedException,
    )
    expect(rows).toHaveLength(0)
    db.$queryRaw.mockResolvedValue([])
    await expect(service.create(1, input)).rejects.toThrow(
      UnauthorizedException,
    )
  })
  it('事务失败不遗留半完成的新地址或默认状态', async () => {
    await service.create(1, input)
    const before = structuredClone(rows)
    db.userAddress.updateMany.mockRejectedValueOnce(new Error('write failed'))
    await expect(
      service.create(1, { ...input, isDefault: true }),
    ).rejects.toThrow('write failed')
    expect(rows).toEqual(before)
  })
  it('死锁冲突最多重试三次，失败转为可重试 409', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' })
    expect((await service.create(1, input)).isDefault).toBe(true)
    db.$transaction.mockReset().mockRejectedValue({ code: 'P2034' })
    await expect(service.create(1, input)).rejects.toThrow(ConflictException)
    expect(db.$transaction).toHaveBeenCalledTimes(3)
  })
})
