import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 营销活动请求参数及校验规则。
export class SaveMarketingActivityDto {
  // 业务名称。
  @IsString()
  @MaxLength(100)
  name: string

  // 优惠券模板编号。
  @IsInt()
  @Min(1)
  @Max(2147483647)
  templateId: number

  // 是否启用。
  @IsBoolean()
  enabled: boolean

  // 是否属于赠花活动。
  @IsBoolean()
  isFlowerGift: boolean

  // 报销单价以整数分提交，未配置时为 null。
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999999999999)
  reimbursementPerUnit?: number | null
}
