import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { StoreProductQueryDto } from './store-product-query.dto';

export class CatalogQueryDto extends StoreProductQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  declare storeId: number;
}
