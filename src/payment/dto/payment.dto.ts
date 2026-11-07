import { Type } from 'class-transformer'
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { CreateOrderDto } from '../../orders/dto/create-order.dto'

// 新建支付请求参数。
export class PaymentSubmission extends CreateOrderDto {
  // 微信用户标识。
  @IsString() @IsNotEmpty() @MaxLength(128) openid!: string
}

// 继续支付请求参数。
export class ContinuePayment {
  // 业务订单编号。
  @IsString() @IsNotEmpty() @MaxLength(64) orderId!: string
  // 微信用户标识。
  @IsString() @IsNotEmpty() @MaxLength(128) openid!: string
}

// 零元订单请求参数。
export class FreePayment {
  // 接口业务参数。
  @IsDefined()
  @ValidateNested()
  @Type(() => PaymentSubmission)
  params!: PaymentSubmission
}
