import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 商品请求参数及校验规则。
export class SaveProductCategoryDto {
  // 业务名称。
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name: string

  // 是否启用。
  @IsBoolean()
  enabled: boolean

  // 显示排序值。
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number
}
