import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 定制花束请求参数及校验规则。
export class BouquetSettingsDto {
  // 是否开放定制服务。
  @IsBoolean()
  customEnabled!: boolean

  /** 整数分。 */
  @IsInt()
  @Min(0)
  @Max(999999999)
  deliveryFee!: number

  // 营业时间说明。
  @IsString()
  @MaxLength(255)
  businessHours!: string

  // 客服电话。
  @IsString()
  @MaxLength(32)
  servicePhone!: string

  // 配送人员说明。
  @IsString()
  @MaxLength(255)
  deliveryStaff!: string
}
