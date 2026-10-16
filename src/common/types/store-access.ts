// service 校验身份后确定的门店访问范围；字段为空表示可访问全部门店。
export interface StoreAccess {
  storeId?: number
  managerId?: number
}
