import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 商品请求参数及校验规则。
export class ProductSpecDto {
  // 记录编号。
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number

  // 业务名称。
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  // 商品计量单位。
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit: string

  /** 接口金额统一使用整数分。 */
  @IsInt()
  @Min(0)
  @Max(999999999999)
  price: number

  // 每份商品的花材支数。
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  stemsPerUnit?: number | null

  // 是否启用。
  @IsBoolean()
  enabled: boolean

  // 显示排序值。
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number
}
