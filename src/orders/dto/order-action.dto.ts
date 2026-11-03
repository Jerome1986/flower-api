import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator'

// 订单数据与处理逻辑。
export class OrderAction {
  // 待执行的业务操作。
  @IsIn(['accept', 'ready', 'deliver', 'complete', 'cancel'])
  action!: string

  // 并发更新版本号。
  @IsInt()
  @Min(0)
  version!: number

  // 自取核销码。
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  pickupCode?: string
}
