import { PartialType } from '@nestjs/mapped-types'
import { CreateStoreDto } from './create-store.dto'

// 门店请求参数及校验规则。
export class UpdateStoreDto extends PartialType(CreateStoreDto, {
  skipNullProperties: false,
}) {}
