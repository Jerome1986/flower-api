// service 校验身份后确定的门店访问范围；字段为空表示可访问全部门店。
export interface StoreAccess {
  // 门店编号。
  storeId?: number
  // 店长用户编号。
  managerId?: number
}
