import { IsIn, IsString } from 'class-validator';
import { testPhones } from '../user-auth.constants';

export class TestLoginDto {
  @IsString()
  @IsIn(testPhones, { message: '请选择已配置的测试手机号' })
  phone!: string;
}
