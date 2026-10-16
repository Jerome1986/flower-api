const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const printer = ts.createPrinter();
const cap = s => s[0].toUpperCase() + s.slice(1);
const backup = path.join(require('os').tmpdir(), 'flower-repository-refactor');
fs.mkdirSync(backup, { recursive: true });
function walk(n, fn) { fn(n); ts.forEachChild(n, c => walk(c, fn)); }
function edit(text, edits) {
  for (const e of edits.sort((a,b)=>b.start-a.start)) text=text.slice(0,e.start)+e.text+text.slice(e.end);
  return text;
}
const report = [];
for (const sf of program.getSourceFiles()) {
  if (!sf.fileName.endsWith('.service.ts') || sf.fileName.includes('node_modules')) continue;
  const repoPath=sf.fileName.replace('.service.ts','.repository.ts');
  if (!fs.existsSync(repoPath)) continue;
  const oldRepo=fs.readFileSync(repoPath,'utf8');
  if (!oldRepo.includes('SelectSubset')) continue;
  fs.writeFileSync(path.join(backup,path.basename(sf.fileName)),sf.text);
  fs.writeFileSync(path.join(backup,path.basename(repoPath)),oldRepo);
  const delegates = new Map();
  for(const m of oldRepo.matchAll(/(\w+)<T extends Prisma\.\w+>\([\s\S]*?return db\.(\w+)\.(\w+)\(args\);/g)) delegates.set(m[1],{model:m[2],op:m[3]});
  const cls=sf.statements.find(ts.isClassDeclaration);
  const edits=[], constants=[], exports=[], methods=[], names=new Map();
  for(const st of sf.statements) {
    if(ts.isVariableStatement(st) && st.declarationList.declarations.every(d=>/select|include/i.test(d.name.getText(sf)))) {
      constants.push(st.getText(sf).replace(/^export /,''));
      const ns=st.declarationList.declarations.map(d=>d.name.getText(sf));
      exports.push(...ns);
      const isExport=st.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
      edits.push({start:st.getStart(sf),end:st.end,text:`import { ${ns.join(', ')} } from './${path.basename(repoPath,'.ts')}';${isExport ? `\nexport { ${ns.join(', ')} } from './${path.basename(repoPath,'.ts')}';` : ''}`});
    }
  }
  const calls=[];
  walk(cls,n=>{if(ts.isCallExpression(n)&&/^this\.repo\./.test(n.expression.getText(sf))&&(delegates.has(n.expression.name.text)||n.expression.name.text==='queryRaw')) calls.push(n);});
  for(const call of calls) {
    const oldName=call.expression.name.text;
    const delegate=delegates.get(oldName);
    let owner=call.parent;
    while(owner&&!ts.isMethodDeclaration(owner))owner=owner.parent;
    const context=owner.name.getText(sf);
    let base=oldName==='queryRaw'?'query':oldName.replace('findUniqueOrThrow','get').replace('findUnique','find').replace('findFirst','find').replace('findMany','list').replace('updateMany','update').replace('deleteMany','delete').replace('createMany','create');
    base += 'For'+cap(context);
    const count=(names.get(base)||0)+1; names.set(base,count);
    const name=base+(count>1?count:'');
    const arg=call.arguments[0];
    const replacements=[], params=[], passed=[], captures=new Map();
    function capture(n, suggested, explicitType) {
      const original=n.getText(sf);
      let key=original;
      let pname=captures.get(key);
      if(!pname) {
        pname=suggested || original.replace(/\?\./g,'.').split('.').filter(Boolean).map((s,i)=>i?cap(s):s).join('').replace(/[^\w]/g,'');
        if(!pname || pname==='this')pname='value';
        let unique=pname, i=2; while(params.some(p=>p.name===unique))unique=pname+i++;
        pname=unique;
        let type=explicitType || checker.typeToString(checker.getTypeAtLocation(n),n,ts.TypeFormatFlags.NoTruncation);
        type=type.replace(/\bDecimal\b/g,'Prisma.Decimal').replace(/Prisma\.Prisma\./g,'Prisma.');
        params.push({name:pname,type});passed.push(original);captures.set(key,pname);
      }
      const short=ts.isShorthandPropertyAssignment(n.parent);
      replacements.push({start:n.getStart(sf),end:n.end,text:short&&pname!==original?`${original}: ${pname}`:pname});
    }
    const inside=n=>n.getStart(sf)>=arg.getStart(sf)&&n.end<=arg.end;
    function visit(n) {
      if(ts.isPropertyAssignment(n)&&n.parent===arg&&['data','create','update'].includes(n.name.getText(sf))) {
        const prop=n.name.getText(sf), model=cap(delegate.model);
        let type;
        if(delegate.op==='createMany')type=`Prisma.${model}CreateManyInput[]`;
        else if(prop==='create'||delegate.op==='create')type=`Prisma.${model}CreateInput | Prisma.${model}UncheckedCreateInput`;
        else type=`Prisma.${model}UpdateInput | Prisma.${model}UncheckedUpdateInput`;
        capture(n.initializer,prop,type); return;
      }
      if(ts.isShorthandPropertyAssignment(n)&&n.parent===arg&&['data','create','update'].includes(n.name.text)) {
        capture(n.name,n.name.text,`Prisma.${cap(delegate.model)}UpdateInput | Prisma.${cap(delegate.model)}UncheckedUpdateInput`);return;
      }
      if(ts.isCallExpression(n)&&n.expression.getText(sf).startsWith('this.')) {capture(n,n.expression.getText(sf).split('.').pop());return;}
      if(ts.isIdentifier(n)) {
        if((ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)||(ts.isPropertyAssignment(n.parent)&&n.parent.name===n)||ts.isTypeNode(n.parent))return;
        let sym=ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n);
        const dec=sym?.valueDeclaration || sym?.declarations?.[0];
        if(!dec||dec.getSourceFile()!==sf||inside(dec))return;
        if(ts.isImportSpecifier(dec)||ts.isImportClause(dec)||ts.isNamespaceImport(dec))return;
        let top=dec;while(top.parent&&top.parent!==sf)top=top.parent;
        if(ts.isVariableStatement(top)||ts.isTypeAliasDeclaration(top))return;
        let expression=n;
        // Capture scalar fields of records; keep DTO/query parameters as readable objects.
        if(!ts.isParameter(dec))while(ts.isPropertyAccessExpression(expression.parent)&&expression.parent.expression===expression) {
          if(ts.isCallExpression(expression.parent.parent)&&expression.parent.parent.expression===expression.parent)break;
          expression=expression.parent;
        }
        capture(expression);
        return;
      }
      ts.forEachChild(n,visit);
    }
    visit(arg);
    // Drop nested replacements when a whole property chain was captured.
    const clean=replacements.filter((r,i)=>!replacements.some((q,j)=>i!==j&&q.start<=r.start&&q.end>=r.end&&(q.start<r.start||q.end>r.end)));
    let expression=edit(arg.getText(sf),clean.map(r=>({...r,start:r.start-arg.getStart(sf),end:r.end-arg.getStart(sf)})));
    const tx=call.arguments[1];
    params.push({name:'db',type:'Prisma.TransactionClient = this.prisma'});
    if(tx)passed.push(tx.getText(sf));
    const sqlType=call.typeArguments?.map(t=>t.getText(sf)).join(', ');
    const invoke=delegate?`db.${delegate.model}.${delegate.op}(${expression})`:`db.$queryRaw<${sqlType}>(${expression})`;
    methods.push(`  ${name}(${params.map(p=>`${p.name}: ${p.type}`).join(', ')}) {\n    return ${invoke};\n  }`);
    edits.push({start:call.getStart(sf),end:call.end,text:`this.repo.${name}(${passed.join(', ')})`});
    report.push({file:path.basename(sf.fileName),oldName,name,params});
  }
  const repoClass=oldRepo.match(/export class (\w+)/)[1];
  const imports=sf.statements.filter(ts.isImportDeclaration).filter(st=>!st.moduleSpecifier.text.endsWith('.repository')&&!st.moduleSpecifier.text.endsWith('.service')).map(st=>st.getText(sf));
  if(!imports.some(s=>s.includes('@prisma/client')))imports.push("import { Prisma } from '@prisma/client';");
  const aliases=sf.statements.filter(ts.isTypeAliasDeclaration).map(st=>st.getText(sf));
  const constText=constants.map(c=>'export '+c).join('\n');
  const content=imports.join('\n')+`\nimport { PrismaService } from '../prisma/prisma.service';\n`+constText+'\n'+aliases.join('\n')+`\n@Injectable()\nexport class ${repoClass} {\n  constructor(private readonly prisma: PrismaService) {}\n\n  get transaction(): PrismaService['$transaction'] {\n    return this.prisma.$transaction.bind(this.prisma);\n  }\n\n`+methods.join('\n\n')+'\n}\n';
  fs.writeFileSync(repoPath,content);
  fs.writeFileSync(sf.fileName,edit(sf.text,edits));
}
fs.writeFileSync(path.join(backup,'report.json'),JSON.stringify(report,null,2));
console.log(`Extracted ${report.length} queries. Backup: ${backup}`);
