import { SalesQueryDto } from './dto/sales-query.dto'

/** 北京时间自然日，近七天含今天；半开区间，避免月末重复计算。 */
export function salesRange(period: SalesQueryDto['period'], now = new Date()) {
  const offset = 8 * 60 * 60 * 1000
  const local = new Date(now.getTime() + offset)
  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  )
  const start =
    period === 'month'
      ? Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
      : midnight - (period === 'week' ? 6 : 0) * 86400000
  return {
    start: new Date(start - offset),
    end: new Date(midnight + 86400000 - offset),
  }
}
