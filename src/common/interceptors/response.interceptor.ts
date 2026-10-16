import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { map } from 'rxjs/operators'
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators/raw-response.decorator'

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  // 注入路由元数据读取器。
  constructor(private readonly reflector: Reflector) {}

  // 根据路由元数据决定是否包装统一响应结构。
  intercept(context: ExecutionContext, next: CallHandler) {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_WRAP_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (skip) {
      return next.handle()
    }

    return next.handle().pipe(
      map((data) => ({
        code: 200,
        message: 'success',
        data,
      })),
    )
  }
}
