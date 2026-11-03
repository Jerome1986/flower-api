import { PartialType } from '@nestjs/mapped-types'
import { CreateAdminDto } from './create-admin.dto'

// 管理员身份请求参数及校验规则。
export class UpdateAdminDto extends PartialType(CreateAdminDto) {}
