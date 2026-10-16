const fs=require('fs'),ts=require('typescript'),path=require('path');
function walk(n,f){f(n);ts.forEachChild(n,c=>walk(c,f));}
function edit(s,es){for(const e of es.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);return s;}
const paths=fs.readdirSync('src',{recursive:true}).filter(f=>/\.(service|repository)\.ts$/.test(f)).map(f=>path.join('src',f));
for(const p of paths.filter(p=>p.endsWith('.repository.ts'))){
 const sp=p.replace('.repository.ts','.service.ts');if(!fs.existsSync(sp))continue;
 const s=fs.readFileSync(sp,'utf8'),r=fs.readFileSync(p,'utf8'),sf=ts.createSourceFile(sp,s,ts.ScriptTarget.Latest,true),rf=ts.createSourceFile(p,r,ts.ScriptTarget.Latest,true),rc=rf.statements.find(ts.isClassDeclaration),edits=[];
 if(!rc)continue;
 for(const m of rc.members){
  if(ts.isGetAccessor(m)&&m.name.getText(rf)==='transaction'&&!s.includes('this.repo.transaction')){
   edits.push({start:m.getFullStart(),end:m.end,text:''});continue;
  }
  if(!ts.isMethodDeclaration(m))continue;
  const i=m.parameters.findIndex(p=>p.name.getText(rf)==='db');if(i<0)continue;
  let needsTx=false;walk(sf,n=>{if(ts.isCallExpression(n)&&n.expression.getText(sf)===`this.repo.${m.name.getText(rf)}`&&n.arguments.length>i)needsTx=true;});
  if(needsTx)continue;
  const param=m.parameters[i];edits.push({start:i?m.parameters[i-1].end:param.getStart(rf),end:param.end,text:''});
  walk(m.body,n=>{if(ts.isIdentifier(n)&&n.text==='db')edits.push({start:n.getStart(rf),end:n.end,text:'this.prisma'});});
 }
 fs.writeFileSync(p,edit(r,edits));
}
// Remove unused imports introduced while relocating queries, using TypeScript's own refactor.
const parsed=ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json',ts.sys.readFile).config,ts.sys,process.cwd());
const host={getScriptFileNames:()=>parsed.fileNames,getScriptVersion:()=> '0',getScriptSnapshot:f=>fs.existsSync(f)?ts.ScriptSnapshot.fromString(fs.readFileSync(f,'utf8')):undefined,getCurrentDirectory:()=>process.cwd(),getCompilationSettings:()=>parsed.options,getDefaultLibFileName:ts.getDefaultLibFilePath,fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
const ls=ts.createLanguageService(host);
for(const p of paths){
 if(!fs.readFileSync(p,'utf8').includes('this.repo.')&&!p.endsWith('.repository.ts'))continue;
 for(const c of ls.organizeImports({type:'file',fileName:path.resolve(p)},{},{})){
  let s=fs.readFileSync(c.fileName,'utf8');s=edit(s,c.textChanges.map(t=>({start:t.span.start,end:t.span.start+t.span.length,text:t.newText})));fs.writeFileSync(c.fileName,s);
 }
}
