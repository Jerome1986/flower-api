jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ResponseInterceptor } from '../common/interceptors/response.interceptor'
import { OrdersService } from '../orders/orders.service'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import { UserAuthService } from '../user-auth/user-auth.service'
import {
  PaymentController,
  PaymentNotifyController,
} from './payment.controller'
import { PaymentService } from './payment.service'
import { WechatPayClient } from './wechat-pay.client'

describe('前端支付接口与回调 HTTP 协议', () => {
  let app: INestApplication
  const orders = { create: jest.fn() }
  const payments = {
    assertConfigured: jest.fn(),
    pay: jest.fn(),
    paid: jest.fn(),
    refunded: jest.fn(),
  }
  const wx = { notification: jest.fn(), config: () => ({ MCH_ID: 'merchant' }) }
  const input = {
    storeId: 2,
    method: 'pickup',
    items: [{ productId: 1, specId: 11, quantity: 1 }],
    contactName: '花友',
    contactPhone: '13800000000',
    requestKey: 'payment-test-000001',
    expectedAmount: 1200,
    openid: 'openid',
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentController, PaymentNotifyController],
      providers: [
        { provide: OrdersService, useValue: orders },
        { provide: PaymentService, useValue: payments },
        { provide: WechatPayClient, useValue: wx },
        {
          provide: UserAuthService,
          useValue: { currentUser: async () => ({ openId: 'openid' }) },
        },
      ],
    })
      .overrideGuard(UserAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest()
          req.userId = 2
          return req.headers.authorization === 'Bearer test'
        },
      })
      .compile()
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
    jest.clearAllMocks()
    orders.create.mockResolvedValue({ orderNo: 'ORD-test' })
    payments.pay.mockResolvedValue({
      orderId: 'ORD-test',
      timeStamp: '1',
      nonceStr: 'nonce',
      packageValue: 'prepay_id=x',
      signType: 'RSA',
      paySign: 'signature',
    })
    wx.notification.mockReturnValue({ mchid: 'merchant' })
  })
  test('购物车字段和返回支付参数兼容前端，继续支付不创建订单', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/pay/commonPay')
      .set('Authorization', 'Bearer test')
      .send(input)
      .expect(200)
    expect(response.body).toMatchObject({
      code: 200,
      data: {
        orderId: 'ORD-test',
        packageValue: 'prepay_id=x',
        signType: 'RSA',
      },
    })
    await request(app.getHttpServer())
      .post('/api/pay/orderPay')
      .set('Authorization', 'Bearer test')
      .send({ orderId: 'ORD-test', openid: 'openid' })
      .expect(200)
    expect(orders.create).toHaveBeenCalledTimes(1)
    expect(payments.pay).toHaveBeenLastCalledWith(2, 'ORD-test', 'openid')
  })
  test('零元接口保留 params 包装并进入服务端金额重算，不调用微信', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/order/createOrderFree')
      .set('Authorization', 'Bearer test')
      .send({ params: { ...input, expectedAmount: 0 } })
      .expect(200)
    expect(result.body.data).toEqual({ orderId: 'ORD-test' })
    expect(orders.create).toHaveBeenCalled()
    expect(payments.pay).not.toHaveBeenCalled()
    expect(payments.assertConfigured).not.toHaveBeenCalled()
    await request(app.getHttpServer())
      .post('/api/order/createOrderFree')
      .set('Authorization', 'Bearer test')
      .send({ params: input })
      .expect(400)
  })
  test('缺 token、错误 openid、未知字段、缺少 params 均不能创建订单', async () => {
    await request(app.getHttpServer())
      .post('/api/pay/commonPay')
      .send(input)
      .expect(403)
    await request(app.getHttpServer())
      .post('/api/pay/commonPay')
      .set('Authorization', 'Bearer test')
      .send({ ...input, openid: 'other' })
      .expect(400)
    await request(app.getHttpServer())
      .post('/api/pay/commonPay')
      .set('Authorization', 'Bearer test')
      .send({ ...input, total: 1 })
      .expect(400)
    await request(app.getHttpServer())
      .post('/api/order/createOrderFree')
      .set('Authorization', 'Bearer test')
      .send({})
      .expect(400)
    expect(orders.create).not.toHaveBeenCalled()
  })
  test('回调接收通知对象、不要求用户登录、返回空 204；失败使用 FAIL', async () => {
    const body = { event_type: 'TRANSACTION.SUCCESS', resource: {} }
    const result = await request(app.getHttpServer())
      .post('/api/notify/wxPay')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(204)
    expect(result.text).toBe('')
    expect(wx.notification).toHaveBeenCalledWith(body, 'TRANSACTION.SUCCESS')
    payments.paid.mockRejectedValueOnce(new Error('database unavailable'))
    const failed = await request(app.getHttpServer())
      .post('/api/notify/wxPay')
      .send({})
      .expect(500)
    expect(failed.body).toEqual({
      code: 'FAIL',
      message: '通知处理失败，请重试',
    })
  })
})
