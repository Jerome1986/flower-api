import { IsBoolean } from 'class-validator';

export class AdminAccountStatusDto {
  @IsBoolean()
  status: boolean;
}
