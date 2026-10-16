const fs=require('fs'),ts=require('typescript');
function change(f,fn){fs.writeFileSync(f,fn(fs.readFileSync(f,'utf8')));}
for(const module of ['store-product','orders/manage-orders','sales']){
 const base=module.includes('/')?`src/${module}`:`src/${module}/${module}`;
 for(const suffix of ['service','repository'])change(`${base}.${suffix}.ts`,s=>{
   s="import type { StoreAccess } from '../common/types/store-access';\n"+s;
   if(module==='orders/manage-orders')s=s.replaceAll('scope: Prisma.OrderWhereInput','scope: StoreAccess').replaceAll('scope(admin: CurrentAdmin): Prisma.OrderWhereInput','scope(admin: CurrentAdmin): StoreAccess');
   else s=s.replaceAll('scope: Prisma.StoreWhereInput','scope: StoreAccess').replaceAll('scope(admin: CurrentAdmin): Prisma.StoreWhereInput','scope(admin: CurrentAdmin): StoreAccess');
   if(suffix==='service'){
     s=s.replace("return { type: 'ORDINARY' };","return {};").replace("return { type: 'ORDINARY', store: { managerId: admin.id } };","return { managerId: admin.id };").replace("return { type: 'ORDINARY', storeId: admin.storeId };","return { storeId: admin.storeId };");
     s=s.replaceAll('return { id: admin.storeId };','return { storeId: admin.storeId };').replace('scope = { id: admin.storeId };','scope = { storeId: admin.storeId };');
   }else if(module==='orders/manage-orders'){
     s=s.replace('this.prisma);','this.prisma);');
     s=s.replace('AND: [{ orderNo: no }, scope]','AND: [{ orderNo: no }, this.orderWhere(scope)]').replace(/\n\s*scope,\n/g,'\n        this.orderWhere(scope),\n');
     s=s.replace(/\n}\s*$/,`\n  private orderWhere(scope: StoreAccess): Prisma.OrderWhereInput {\n    return { type: 'ORDINARY', storeId: scope.storeId, ...(scope.managerId !== undefined ? { store: { managerId: scope.managerId } } : {}) };\n  }\n}\n`);
   }else {
     s=s.replace('AND: [{ id: storeId }, scope]','AND: [{ id: storeId }, { id: scope.storeId, managerId: scope.managerId }]').replace('AND: [{ id: query.storeId }, scope]','AND: [{ id: query.storeId }, { id: scope.storeId, managerId: scope.managerId }]');
     s=s.replaceAll('store: scope','store: { id: scope.storeId, managerId: scope.managerId }').replaceAll('where: scope','where: { id: scope.storeId, managerId: scope.managerId }');
   }
   return s;
 });
}
change('src/store/store.service.ts',s=>s.replaceAll('readScope','accessibleStoreIds').replace('accessibleStoreIds(admin: CurrentAdmin): Prisma.StoreWhereInput','accessibleStoreIds(admin: CurrentAdmin): number[] | undefined').replace('if (this.isPlatform(admin)) return {};','if (this.isPlatform(admin)) return undefined;').replace('return { id: { in: admin.storeIds } };','return admin.storeIds;').replace('return { id: admin.storeId };','return [admin.storeId];'));
change('src/store/store.repository.ts',s=>s.replace('readScope: Prisma.StoreWhereInput','storeIds: number[] | undefined').replace('...readScope,','...(storeIds ? { id: { in: storeIds } } : {}),'));
// The public shop filter is a database concern, not a business step.
const sp='src/shop/shop.service.ts',rp='src/shop/shop.repository.ts';let s=fs.readFileSync(sp,'utf8'),r=fs.readFileSync(rp,'utf8');
const sf=ts.createSourceFile(sp,s,ts.ScriptTarget.Latest,true),cls=sf.statements.find(ts.isClassDeclaration),m=cls.members.find(m=>m.name?.getText(sf)==='where');
r=r.replace(/\n}\s*$/,'\n'+m.getText(sf)+'\n}\n');
s=s.slice(0,m.getFullStart())+s.slice(m.end);s=s.replaceAll('this.where(storeId)','storeId');
r=r.replaceAll('where: Prisma.StoreProductWhereInput','storeId: number').replace('where: where,','where: this.where(storeId),').replace('...where, productId','...this.where(storeId), productId');
fs.writeFileSync(sp,s);fs.writeFileSync(rp,r);
// SQL fragments belong beside the aggregation queries.
const sales='src/sales/sales.service.ts',salesRepo='src/sales/sales.repository.ts';s=fs.readFileSync(sales,'utf8');r=fs.readFileSync(salesRepo,'utf8');
const fragments=s.match(/        const (?:real|received) = Prisma.sql[^\n]+;/g);
for(const fragment of fragments||[]){s=s.replace(fragment,'');r=fragment.trim()+'\n'+r;}
s=s.replace('sumRevenue(received, real,','sumRevenue(').replace('countOrderStates(real,','countOrderStates(').replace('sumGifts(real,','sumGifts(');
r=r.replace('received: Prisma.Sql, real: Prisma.Sql, ','').replaceAll('real: Prisma.Sql, ','');
fs.writeFileSync(sales,s);fs.writeFileSync(salesRepo,r);
