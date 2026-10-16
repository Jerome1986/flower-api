import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'

// 构造字符串去空白转换器，保留其他类型供字段校验。
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )

export class CreateStoreDto {
  /** 店长手机号：匹配已有用户或自动创建店长用户 */
  @Trim()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的11位店长手机号' })
  managerPhone: string

  /** 门店名称 */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: '门店名称不能为空' })
  @MaxLength(100)
  name: string

  /** 详细地址 */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: '门店地址不能为空' })
  @MaxLength(500)
  address: string

  /** 联系电话，可包含区号和分机 */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: '联系电话不能为空' })
  @MaxLength(32)
  phone: string

  /** 营业时间说明 */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: '营业时间不能为空' })
  @MaxLength(255)
  businessHours: string

  /** 是否启用 */
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean

  /** 是否营业 */
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isOpen?: boolean

  /** 配送区域展示说明 */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000)
  deliveryArea?: string | null

  /** 固定配送费，接口使用整数分，数据库保存元 */
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(999999999999)
  deliveryFee?: number

  /** 客服电话 */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(32)
  servicePhone?: string | null

  /** 配送执行人员说明 */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  deliveryStaff?: string | null

  /** 排序值，越小越靠前 */
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder?: number
}
