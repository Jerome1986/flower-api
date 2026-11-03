import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { QuoteOrderDto } from './quote-order.dto'

// 订单请求参数及校验规则。
export class CreateOrderDto extends QuoteOrderDto {
  // 客户端下单幂等键。
  @IsString()
  @Matches(/^[a-zA-Z0-9-]{16,64}$/)
  requestKey!: string

  // 收花联系人姓名。
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  contactName!: string

  // 收花联系人手机号。
  @IsString()
  @Matches(/^1\d{10}$/)
  contactPhone!: string

  // 收货地址信息。
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string

  // 备注内容。
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string

  // 客户端确认的应付金额（分）。
  @IsInt()
  @Min(0)
  @Max(999999999)
  expectedAmount!: number
}
