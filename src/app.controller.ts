import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  // 注入应用业务服务，统一处理接口请求。
  constructor(private readonly appService: AppService) {}

  // 返回应用标识。
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
