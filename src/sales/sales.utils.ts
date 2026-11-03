import { SalesQueryDto } from './dto/sales-query.dto'

/** 北京时间自然日，近七天含今天；半开区间，避免月末重复计算。 */
export function salesRange(
  // 统计周期。
  period: SalesQueryDto['period'],
  // 当前时间。
  now = new Date(),
) {
  // 1. 计算北京时间与 UTC 的时差。
  const offset = 8 * 60 * 60 * 1000
  // 2. 计算用于计算北京时间日期的时间值。
  const local = new Date(now.getTime() + offset)
  // 3. 计算北京时间当天零点的基准值。
  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  )
  // 4. 计算统计区间起点。
  const start =
    period === 'month'
      ? Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
      : midnight - (period === 'week' ? 6 : 0) * 86400000
  // 5. 返回本次处理结果。
  return {
    start: new Date(start - offset),
    end: new Date(midnight + 86400000 - offset),
  }
}
