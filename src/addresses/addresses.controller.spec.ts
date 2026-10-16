import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ResponseInterceptor } from '../common/interceptors/response.interceptor'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import { AddressesController } from './addresses.controller'
import { AddressesService } from './addresses.service'
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
describe('地址 HTTP 契约与校验', () => {
  let app: INestApplication
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setDefault: jest.fn(),
  }
  const jwt = { verifyAsync: jest.fn() }
  const input = {
    name: ' 花友 ',
    phone: '13800000000',
    province: '浙江省',
    city: '杭州市',
    district: '西湖区',
    detail: '花园路',
    isDefault: false,
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AddressesController],
      providers: [
        UserAuthGuard,
        { provide: AddressesService, useValue: service },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)))
    await app.init()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(() => {
    jest.resetAllMocks()
    jwt.verifyAsync.mockResolvedValue({ userId: 7, type: 'user' })
    service.list.mockResolvedValue([])
    service.create.mockResolvedValue({
      id: 10,
      ...input,
      name: '花友',
      isDefault: true,
    })
  })
  const endpoint = '/api/user/addresses'
  it('无令牌、过期令牌和后台令牌均不能访问', async () => {
    await request(app.getHttpServer()).get(endpoint).expect(401)
    jwt.verifyAsync.mockRejectedValueOnce(new Error('expired'))
    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', 'Bearer expired')
      .expect(401)
    jwt.verifyAsync.mockResolvedValueOnce({ userId: 7, type: 'admin' })
    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', 'Bearer admin')
      .expect(401)
    expect(service.list).not.toHaveBeenCalled()
  })
  it('成功使用统一响应，用户身份只取令牌', async () => {
    const response = await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer user')
      .send(input)
      .expect(201)
    expect(response.body).toMatchObject({
      code: 200,
      message: 'success',
      data: { id: 10, name: '花友', isDefault: true },
    })
    expect(service.create).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ name: '花友' }),
    )
    await request(app.getHttpServer())
      .get(endpoint)
      .set('Authorization', 'Bearer user')
      .expect(200, { code: 200, message: 'success', data: [] })
  })
  it.each([
    { name: '   ' },
    { phone: '123' },
    { province: '' },
    { city: ' ' },
    { district: null },
    { detail: 'x'.repeat(501) },
    { isDefault: 'true' },
    { isDefault: null },
    { userId: 99 },
    { region: '不支持混合地区' },
    { regionCode: null },
  ])('拒绝非法/越权输入 %j', async (patch) => {
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', 'Bearer user')
      .send({ ...input, ...patch })
      .expect(400)
    expect(service.create).not.toHaveBeenCalled()
  })
  it.each(['0', '-1', 'abc', '1.5', '2147483648'])(
    '拒绝非法地址 ID %s',
    async (id) => {
      await request(app.getHttpServer())
        .delete(endpoint + '/' + id)
        .set('Authorization', 'Bearer user')
        .expect(400)
      expect(service.remove).not.toHaveBeenCalled()
    },
  )
  it('完整更新、删除及设默认路由传入地址 ID 和用户 ID', async () => {
    await request(app.getHttpServer())
      .put(endpoint + '/10')
      .set('Authorization', 'Bearer user')
      .send(input)
      .expect(200)
    expect(service.update).toHaveBeenCalledWith(
      7,
      10,
      expect.objectContaining({ name: '花友' }),
    )
    await request(app.getHttpServer())
      .post(endpoint + '/10/default')
      .set('Authorization', 'Bearer user')
      .expect(200)
    expect(service.setDefault).toHaveBeenCalledWith(7, 10)
    service.remove.mockRejectedValueOnce(new NotFoundException('地址不存在'))
    await request(app.getHttpServer())
      .delete(endpoint + '/10')
      .set('Authorization', 'Bearer user')
      .expect(404)
    expect(service.remove).toHaveBeenCalledWith(7, 10)
  })
})
