import { IsBoolean } from 'class-validator'

export class ProductStatusDto {
  @IsBoolean()
  enabled: boolean
}
