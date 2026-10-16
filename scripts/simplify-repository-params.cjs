const fs=require('fs'),ts=require('typescript'),path=require('path');
const parsed=ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json',ts.sys.readFile).config,ts.sys,process.cwd());
const program=ts.createProgram(parsed.fileNames,parsed.options),checker=program.getTypeChecker();
function walk(n,f){f(n);ts.forEachChild(n,c=>walk(c,f));}
function edit(s,es){for(const e of es.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);return s;}
for(const rf of program.getSourceFiles()){
 if(!rf.fileName.endsWith('.repository.ts')||rf.fileName.includes('node_modules'))continue;
 const sf=program.getSourceFile(rf.fileName.replace('.repository.ts','.service.ts'));if(!sf)continue;
 const cls=rf.statements.find(ts.isClassDeclaration),re=[],se=[];
 for(const m of cls.members.filter(ts.isMethodDeclaration)){
  const calls=[];walk(sf,n=>{if(ts.isCallExpression(n)&&n.expression.getText(sf)===`this.repo.${m.name.getText(rf)}`)calls.push(n);});
  if(!calls.length)continue;
  for(let i=0;i<m.parameters.length;i++){
   const p=m.parameters[i],pname=p.name.getText(rf);if(pname==='db')continue;
   const uses=[];walk(m.body,n=>{if(ts.isIdentifier(n)&&n.text===pname&&!(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)&&!(ts.isPropertyAssignment(n.parent)&&n.parent.name===n))uses.push(n);});
   if(!uses.length||uses.some(n=>!ts.isPropertyAccessExpression(n.parent)||n.parent.expression!==n))continue;
   const fields=new Set(uses.map(n=>n.parent.name.text));if(fields.size!==1)continue;
   const field=[...fields][0];let type=checker.typeToString(checker.getTypeAtLocation(uses[0].parent),uses[0].parent,ts.TypeFormatFlags.NoTruncation);
   if(type.includes('=>')||type.includes('import('))continue;
   let name=field;if(m.parameters.some(q=>q!==p&&q.name.getText(rf)===name))name=pname+field[0].toUpperCase()+field.slice(1);
   if(m.name.getText(rf)==='findCategoryById')type='number';
   re.push({start:p.getStart(rf),end:p.end,text:`${name}: ${type}`});
   for(const n of uses)re.push({start:n.parent.getStart(rf),end:n.parent.end,text:name});
   for(const c of calls){const a=c.arguments[i];se.push({start:a.getStart(sf),end:a.end,text:`${a.getText(sf)}.${field}`});}
  }
 }
 if(re.length){fs.writeFileSync(rf.fileName,edit(rf.text,re));fs.writeFileSync(sf.fileName,edit(sf.text,se));}
}
