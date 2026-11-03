import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

// 定制花束数据与处理逻辑。
export class CustomOrderAction {
  // 待执行的业务操作。
  @IsIn(['dispatch', 'deliver', 'complete', 'cancel'])
  action!: 'dispatch' | 'deliver' | 'complete' | 'cancel'

  // 并发更新版本号。
  @IsInt()
  @Min(0)
  version!: number

  // 合作方名称。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partnerName?: string

  // 合作方联系电话。
  @IsOptional()
  @IsString()
  @MaxLength(32)
  partnerPhone?: string

  // 备注内容。
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string
}
