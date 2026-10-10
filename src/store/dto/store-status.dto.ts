import { IsBoolean, ValidateIf } from 'class-validator';

export class StoreStatusDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isOpen?: boolean;
}
