import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

// 定制花束请求参数及校验规则。
export class QuoteBouquetDto {
  // 定制花束商品编号。
  @IsInt()
  @Min(1)
  @Max(2147483647)
  bouquetId!: number

  // 商品规格编号。
  @IsInt()
  @Min(1)
  @Max(2147483647)
  specId!: number

  // 商品份数。
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number

  // 收货地址信息。
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string
}
