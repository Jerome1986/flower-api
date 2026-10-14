import { IsIn, IsInt, Max, Min } from 'class-validator';

export class QuoteOrderDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  storeId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  specId!: number;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @IsIn(['pickup', 'delivery'])
  method!: 'pickup' | 'delivery';
}
