import { SetMetadata } from '@nestjs/common'

export const SKIP_RESPONSE_WRAP_KEY = 'skipResponseWrap'

// 标记接口保留原始响应，跳过统一响应包装。
export const RawResponse = () => SetMetadata(SKIP_RESPONSE_WRAP_KEY, true)
