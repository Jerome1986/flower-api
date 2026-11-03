jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { ManageOrdersRepository } from './manage-orders.repository'
import { ManageOrdersService } from './manage-orders.service'
import { SalesRepository } from '../sales/sales.repository'

describe('小程序店长访问范围', () => {
  test.each([
    { enabled: false, role: 'STORE_MANAGER', managedStores: [{ id: 2 }] },
    { enabled: true, role: 'CUSTOMER', managedStores: [{ id: 2 }] },
    { enabled: true, role: 'STORE_MANAGER', managedStores: [] },
  ])('当前已禁用、降权或无负责门店时拒绝管理接口 %j', async (user) => {
    const guard = new AdminAuthGuard({ verifyAsync: async () => ({ type: 'user', userId: 1 }) } as any, { findAuthManager: async () => user } as any)
    const request = { headers: { authorization: 'Bearer token' } }
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any)).rejects.toThrow('店长身份不可用')
  })
  test('当前负责门店由服务端身份查询得到', async () => {
    const guard = new AdminAuthGuard({ verifyAsync: async () => ({ type: 'user', userId: 1 }) } as any, { findAuthManager: async () => ({ enabled: true, role: 'STORE_MANAGER', phone: '13800000000', managedStores: [{ id: 2 }] }) } as any)
    const request: any = { headers: { authorization: 'Bearer token' } }
    await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any)
    expect(request.admin.storeIds).toEqual([2])
    expect(request.admin.role).toBe('STORE_MANAGER')
  })
  test('按订单号查询同时限定普通订单和负责店长，猜测其他订单号不能绕过', async () => {
    const findFirst = jest.fn(async (_query: any) => null)
    const repo = new ManageOrdersRepository({ order: { findFirst } } as any)
    const service = new ManageOrdersService(repo, {} as any, {} as any)
    await expect(service.detail('OTHER-STORE', { id: 1, role: 'STORE_MANAGER' } as any)).rejects.toThrow('无访问权限')
    expect(findFirst.mock.calls[0][0].where).toEqual({ AND: [{ orderNo: 'OTHER-STORE' }, { type: 'ORDINARY', storeId: undefined, store: { managerId: 1 } }] })
  })
  test('指定统计门店不会覆盖账号原有门店权限', async () => {
    const findFirst = jest.fn(async (_query: any) => null)
    const repo = new SalesRepository({ store: { findFirst } } as any)
    await repo.findStore(99, { managerId: 1 })
    expect(findFirst.mock.calls[0][0].where.AND).toEqual([{ id: 99 }, { id: undefined, managerId: 1 }])
  })
})
