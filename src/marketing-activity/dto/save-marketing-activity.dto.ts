import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class SaveMarketingActivityDto {
  @IsString()
  @MaxLength(100)
  name: string

  @IsInt()
  @Min(1)
  @Max(2147483647)
  templateId: number

  @IsBoolean()
  enabled: boolean

  @IsBoolean()
  isFlowerGift: boolean

  // 报销单价以整数分提交，未配置时为 null。
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999999999999)
  reimbursementPerUnit?: number | null
}
