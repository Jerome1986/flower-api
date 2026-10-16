// 清理地址输入字符串两端空白，保留非字符串供校验器处理。
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value
