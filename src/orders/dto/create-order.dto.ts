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

export class CreateOrderDto extends QuoteOrderDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9-]{16,64}$/)
  requestKey!: string

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  contactName!: string

  @IsString()
  @Matches(/^1\d{10}$/)
  contactPhone!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string

  @IsInt()
  @Min(0)
  @Max(999999999)
  expectedAmount!: number
}
