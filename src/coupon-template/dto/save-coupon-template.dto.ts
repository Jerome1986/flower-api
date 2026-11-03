import { CouponType } from '@prisma/client'
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 优惠券模板请求参数及校验规则。
export class SaveCouponTemplateDto {
  // 业务名称。
  @IsString()
  @MaxLength(100)
  name: string

  // 业务类型。
  @IsEnum(CouponType)
  type: CouponType

  /** 接口金额采用整数分，后台表单以元展示和填写。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999999999999)
  cashAmount?: number | null

  // 可兑换的商品规格编号。
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  exchangeSpecId?: number | null

  // 优惠券兑换份数。
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  exchangeQuantity?: number | null

  // 优惠券有效小时数。
  @IsInt()
  @Min(1)
  @Max(87600)
  validityHours: number

  // 是否启用。
  @IsBoolean()
  enabled: boolean
}
