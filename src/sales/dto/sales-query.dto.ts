import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export class SalesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  storeId!: number;

  @IsIn(['today', 'week', 'month'])
  period!: 'today' | 'week' | 'month';
}
