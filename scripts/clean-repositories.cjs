const fs=require('fs'),ts=require('typescript'),path=require('path');
const files=fs.readdirSync('src',{recursive:true}).filter(f=>/\.(service|repository)\.ts$/.test(f)).map(f=>path.join('src',f));
const maps={
 'product':{listProductCategoryForCategories:'findCategories',createProductCategoryForSaveCategory:'createCategory',updateProductCategoryForSaveCategory:'updateCategory',findProductForDetail:'findById',findProductForSave:'findWithSpecs',findProductCategoryForSave:'findCategoryById',createProductForSave:'createProduct',updateProductForSave:'updateProduct',updateProductSpecForSave:'updateSpec',updateProductSpecForSave2:'updateSpec',updateProductSpecForSave3:'updateSpec',createProductSpecForSave:'createSpec',getProductForSave:'getById',updateProductForStatus:'updateStatus'},
 'addresses':{findUserForList:'findUser',listUserAddressForList:'findByUserId',queryForWrite:'lockUser',findUserAddressForOwned:'findOwnedAddress',listUserAddressForNormalizeDefault:'findDefaultCandidates',updateUserAddressForNormalizeDefault:'clearOtherDefaults',updateUserAddressForNormalizeDefault2:'setDefault',createUserAddressForCreate:'createAddress',updateUserAddressForUpdate:'updateAddress',deleteUserAddressForRemove:'deleteAddress'},
 'admin-account':{findAdminForFind:'findById',countAdminForProtect:'countOtherSuperAdmins',createAdminForCreate:'createAdmin',updateAdminForUpdate:'updateAdmin',updateAdminForStatus:'updateAdmin',updateAdminForResetPassword:'updateAdmin'},
 'customer-user':{findUserForFind:'findById',updateUserForStatus:'updateStatus'},
 'banner':{findPlatformConfigForList:'findConfig',findPlatformConfigForSave:'findConfig',findPlatformConfigForPublicList:'findConfig',upsertPlatformConfigForSave:'saveConfig'},
 'marketing-activity':{findCouponTemplateForRules:'findTemplate',listMarketingActivityForList:'findAll',upsertMarketingActivityForSave:'saveActivity',findMarketingActivityForStatus:'findByTrigger',updateMarketingActivityForStatus:'updateActivity'},
 'shop':{listStoreForStores:'findStores',findStoreForStore:'findStoreById',listStoreProductForProducts:'findProducts',findStoreProductForProduct:'findProduct'},
 'store':{upsertUserForResolveManager:'saveManager',createStoreForCreate:'createStore',findStoreForFindOne:'findById',findStoreForUpdate:'findManager',updateStoreForUpdate:'updateStore',countStoreForUpdate:'countByManagerId',updateUserForUpdate:'restoreCustomerRole'},
 'coupon-template':{findCouponTemplateForFind:'findById',findProductSpecForRules:'findExchangeSpec',countMarketingActivityForSave:'countGiftActivities',createCouponTemplateForSave:'createTemplate',updateCouponTemplateForSave:'updateTemplate',updateCouponTemplateForStatus:'updateTemplate'},
 'store-product':{findStoreForStore:'findStore',findStoreProductForSelected:'findById',listStoreForStores:'findStores',findProductForCreate:'findProductWithSpecs',createStoreProductForCreate:'createProduct',createStoreStockForCreate:'createStocks',updateStoreProductForUpdate:'updateProduct',findInventoryLogForAdjust:'findInventoryLog',findInventoryLogForAdjust2:'findInventoryLog',createStoreStockForAdjust:'createMissingStocks',getStoreStockForAdjust:'getStock',updateStoreStockForAdjust:'updateStock',createInventoryLogForAdjust:'createInventoryLog'},
 'orders':{findStoreProductForSelection:'findAvailableProduct',findProductSpecForSelection:'findAvailableSpec',findOrderForCreate:'findByRequestKey',findOrderForCreate2:'findByRequestKey',updateStoreStockForCreate:'reserveStock',createOrderForCreate:'createOrder',createInventoryLogForCreate:'createInventoryLog',createInventoryLogForCancel:'createInventoryLog',listOrderForList:'findByUserId',findOrderForDetail:'findUserOrder',findOrderForCancel:'findUserOrder',updateOrderForCancel:'cancelOrder',findInventoryLogForCancel:'findReservation',getStoreStockForCancel:'getStock',updateStoreStockForCancel:'releaseStock',createOrderLogForCancel:'createOrderLog',getOrderForCancel:'getById',listOrderForCloseExpired:'findExpiredOrders'},
 'manage-orders':{listStoreForStores:'findStores',findOrderForSelected:'findOrder',updateOrderForAction:'updateOrder',findInventoryLogForAction:'findReservation',getStoreStockForAction:'getStock',updateStoreStockForAction:'consumeStock',createInventoryLogForAction:'createInventoryLog',createOrderLogForAction:'createOrderLog',getOrderForAction:'getById'},
 'bouquets':{findPlatformConfigForConfig:'findConfig',findPlatformConfigForSettings:'findConfig',listProductForList:'findProducts',findProductForDetail:'findProductById',findProductForSelection:'findAvailableProduct',findOrderForCreate:'findByRequestKey',findOrderForCreate2:'findByRequestKey',createOrderForCreate:'createOrder',upsertPlatformConfigForSaveSettings:'saveConfig',findOrderForManageDetail:'findOrderDetail',findOrderForAction:'findOrder',updateOrderForAction:'updateOrder',createOrderDispatchForAction:'createDispatch',createOrderLogForAction:'createOrderLog',getOrderForAction:'getOrderById',findManageListPage:'findOrderPage'},
 'sales':{findStoreForSummary:'findStore',queryForSummary:'sumRevenue',queryForSummary2:'countOrderStates',queryForSummary3:'sumGifts'}
};
for(const f of files){
 const key=path.basename(f).replace(/\.(service|repository)\.ts$/,'');const map=maps[key];if(!map)continue;
 let s=fs.readFileSync(f,'utf8');
 for(const [a,b]of Object.entries(map))s=s.replace(new RegExp('\\b'+a+'\\b','g'),b);
 if(f.endsWith('.repository.ts')){
  s=s.replace(/import\("[^"]+"\)\.\$Enums\.(\w+)/g,'$1');
  s=s.replace(/Prisma\.(\w+)(Create|Update)Input \| Prisma\.\1Unchecked\2Input/g,(_,model,op)=>`Prisma.${model}${model==='Store'?'':'Unchecked'}${op}Input`);
  s=s.replace(/(createCategory\(data: Prisma\.ProductCategory)UncheckedUpdateInput/,'$1UncheckedCreateInput');
  s=s.replace(/(createTemplate\(data: Prisma\.CouponTemplate)UncheckedUpdateInput/,'$1UncheckedCreateInput');
  s=s.replace(/data: data\b/g,'data').replace(/create: create\b/g,'create').replace(/update: update\b/g,'update');
  s=s.replace(/orderStatus: "PENDING[^,]+, orderVersion/g,'orderStatus: OrderStatus, orderVersion');
  s=s.replace(/orderStatus: "PENDING[^,]+, data/g,'orderStatus: OrderStatus, data');
  if(s.includes('OrderStatus')&&!/import \{[^}]*OrderStatus[^}]*\} from '@prisma\/client'/.test(s))s=s.replace("import { Prisma } from '@prisma/client';","import { Prisma, OrderStatus } from '@prisma/client';");
  const sf=ts.createSourceFile(f,s,ts.ScriptTarget.Latest,true),cls=sf.statements.find(ts.isClassDeclaration),seen=new Set(),edits=[];
  for(const m of cls.members.filter(ts.isMethodDeclaration)){
    const name=m.name.getText(sf);if(seen.has(name))edits.push([m.getFullStart(),m.end]);seen.add(name);
  }
  for(const [start,end]of edits.reverse())s=s.slice(0,start)+s.slice(end);
 }
 fs.writeFileSync(f,s);
}
