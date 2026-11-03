import { IsIn, IsString } from 'class-validator'
import { testPhones } from '../user-auth.constants'

// 用户身份请求参数及校验规则。
export class TestLoginDto {
  // 手机号码。
  @IsString()
  @IsIn(testPhones, { message: '请选择已配置的测试手机号' })
  phone!: string
}
