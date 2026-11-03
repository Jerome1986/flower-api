import { IsIn } from 'class-validator'

// 客户用户请求参数及校验规则。
export class CustomerUserStatusDto {
  // 当前业务状态。
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE'
}
