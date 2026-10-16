import { IsString, Length } from 'class-validator'
import { SaveAdminAccountDto } from './save-admin-account.dto'

export class CreateAdminAccountDto extends SaveAdminAccountDto {
  @IsString()
  @Length(6, 64)
  password: string
}
