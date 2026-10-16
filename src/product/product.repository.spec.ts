import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ProductRepository } from './product.repository'

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))

describe('数据访问层事务契约', () => {
  it('查询原样返回延迟执行的 PrismaPromise，供数组事务使用', () => {
    const operation = {
      then: jest.fn(),
      [Symbol.toStringTag]: 'PrismaPromise',
    }
    const prisma = {
      productCategory: { findMany: jest.fn(() => operation) },
      $transaction: jest.fn(),
    }
    const repo = new ProductRepository(prisma as unknown as PrismaService)

    const query = repo.findCategories()
    expect(query).toBe(operation)
    expect(operation.then).not.toHaveBeenCalled()

    prisma.$transaction([query], { isolationLevel: 'Serializable' })
    expect(prisma.$transaction).toHaveBeenCalledWith([operation], {
      isolationLevel: 'Serializable',
    })
    expect(prisma.$transaction.mock.contexts[0]).toBe(prisma)
  })

  it('事务中的查询使用传入客户端，不回退到全局连接', async () => {
    const prisma = {
      product: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    }
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
    }
    prisma.$transaction.mockImplementation((action) => action(tx))
    const repo = new ProductRepository(prisma as unknown as PrismaService)

    const result = await prisma.$transaction(
      (tx) => repo.findWithSpecs(7, tx),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    )

    expect(result).toEqual({ id: 7 })
    expect(tx.product.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      include: { specs: true },
    })
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    })
  })

  it('分页列表与总数使用同一个传入事务和筛选条件', async () => {
    const prisma = {
      product: { findMany: jest.fn(), count: jest.fn() },
    }
    const tx = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: 7 }]),
        count: jest.fn().mockResolvedValue(5),
      },
    }
    const repo = new ProductRepository(prisma as unknown as PrismaService)

    const result = await repo.findPage(
      { page: 2, pageSize: 2, keyword: '  玫瑰  ', enabled: true },
      tx as unknown as Prisma.TransactionClient,
    )

    expect(result).toEqual([[{ id: 7 }], 5])
    expect(tx.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: '玫瑰' },
          enabled: true,
        }),
        skip: 2,
        take: 2,
      }),
    )
    expect(tx.product.count).toHaveBeenCalledWith({
      where: tx.product.findMany.mock.calls[0][0].where,
    })
    expect(prisma.product.findMany).not.toHaveBeenCalled()
    expect(prisma.product.count).not.toHaveBeenCalled()
  })

  it('分页读取失败时向外层事务抛出原始错误，不继续统计总数', async () => {
    const error = new Error('数据库读取失败')
    const tx = {
      product: {
        findMany: jest.fn().mockRejectedValue(error),
        count: jest.fn(),
      },
    }
    const repo = new ProductRepository({} as PrismaService)

    await expect(
      repo.findPage(
        { page: 1, pageSize: 10 },
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toBe(error)
    expect(tx.product.count).not.toHaveBeenCalled()
  })
})
