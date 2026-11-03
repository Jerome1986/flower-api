import { IsBoolean } from 'class-validator'

// 管理员账号请求参数及校验规则。
export class AdminAccountStatusDto {
  // 当前业务状态。
  @IsBoolean()
  status: boolean
}
