import { Controller, Get } from '@nestjs/common'
import { AppService } from './app.service'

// 应用接口入口。
@Controller()
export class AppController {
  // 注入应用业务服务，统一处理接口请求。
  constructor(
    // 应用基础服务。
    private readonly appService: AppService,
  ) {}

  // 返回应用标识。
  @Get()
  getHello(): string {
    // 1. 返回本次处理结果。
    return this.appService.getHello()
  }
}
