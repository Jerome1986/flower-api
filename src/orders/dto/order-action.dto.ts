import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class OrderAction {
  @IsIn(['accept', 'ready', 'deliver', 'complete', 'cancel'])
  action!: string;

  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  pickupCode?: string;
}
