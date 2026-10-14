import { IsBoolean } from 'class-validator';

export class MarketingActivityStatusDto {
  @IsBoolean()
  enabled: boolean;
}
