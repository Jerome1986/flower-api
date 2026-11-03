import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { map } from 'rxjs/operators'
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators/raw-response.decorator'

// 公共接口数据与处理逻辑。
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  // 注入路由元数据读取器。
  constructor(
    // 路由元数据读取器。
    private readonly reflector: Reflector,
  ) {}

  // 根据路由元数据决定是否包装统一响应结构。
  intercept(
    // 当前接口执行上下文。
    context: ExecutionContext,
    // 后续响应处理器。
    next: CallHandler,
  ) {
    // 1. 准备是否跳过统一响应包装。
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_WRAP_KEY,
      [context.getHandler(), context.getClass()],
    )

    // 2. 根据当前条件选择处理分支。
    if (skip) {
      return next.handle()
    }

    // 3. 返回本次处理结果。
    return next.handle().pipe(
      map((data) => ({
        code: 200,
        message: 'success',
        data,
      })),
    )
  }
}
