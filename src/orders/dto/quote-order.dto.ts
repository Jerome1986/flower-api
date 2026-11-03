import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator'
// 订单请求参数及校验规则。
export class OrderLineDto {
  // 商品编号。
  @IsInt() @Min(1) @Max(2147483647) productId!: number
  // 商品规格编号。
  @IsInt() @Min(1) @Max(2147483647) specId!: number
  // 商品份数。
  @IsInt() @Min(1) @Max(999) quantity!: number
  // 备注内容。
  @IsOptional() @IsString() @MaxLength(500) remark?: string
}
// 订单请求参数及校验规则。
export class QuoteOrderDto {
  // 用户优惠券编号。
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) couponId?: number
  // 门店编号。
  @IsInt() @Min(1) @Max(2147483647) storeId!: number
  // 商品编号。
  @ValidateIf((o) => o.items === undefined || o.productId !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId?: number
  // 商品规格编号。
  @ValidateIf((o) => o.items === undefined || o.specId !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  specId?: number
  // 商品份数。
  @ValidateIf((o) => o.items === undefined || o.quantity !== undefined)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number
  // 业务明细列表。
  @ValidateIf((o) => o.items !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items?: OrderLineDto[]
  // 收花方式。
  @IsIn(['pickup', 'delivery']) method!: 'pickup' | 'delivery'
}
