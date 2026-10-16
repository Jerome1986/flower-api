const fs=require('fs'),ts=require('typescript'),path=require('path');
const parsed=ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json',ts.sys.readFile).config,ts.sys,process.cwd());
const program=ts.createProgram(parsed.fileNames,parsed.options),checker=program.getTypeChecker();
const cap=s=>s[0].toUpperCase()+s.slice(1);
function walk(n,f){f(n);ts.forEachChild(n,c=>walk(c,f));}
function edit(s,es){for(const e of es.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);return s;}
for(const sf of program.getSourceFiles()){
 if(!sf.fileName.endsWith('.service.ts')||sf.fileName.includes('node_modules'))continue;
 const rp=sf.fileName.replace('.service.ts','.repository.ts');if(!fs.existsSync(rp))continue;
 const rf=program.getSourceFile(rp);if(!rf)continue;
 const rc=rf.statements.find(ts.isClassDeclaration),sc=sf.statements.find(ts.isClassDeclaration);if(!sc||!rc)continue;
 const se=[],re=[],add=[];
 for(const method of sc.members.filter(ts.isMethodDeclaration)){
  const statements=method.body?.statements;if(!statements)continue;
  const ws=statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(sf)==='where'));if(!ws)continue;
  const page=statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.initializer?.getText(sf).startsWith('await this.repo.transaction([')));if(!page)continue;
  const pd=page.declarationList.declarations[0],transaction=pd.initializer.expression;
  const moved=statements.filter(s=>ts.isVariableStatement(s)&&s.end<=ws.end&&s.declarationList.declarations.every(d=>['keyword','enabled','groups','where'].includes(d.name.getText(sf))));
  const captures=new Map();
  function capture(n,name){const value=n.getText(sf);if(!captures.has(value))captures.set(value,{name:name||value,type:checker.typeToString(checker.getTypeAtLocation(n),n,ts.TypeFormatFlags.NoTruncation),value});return captures.get(value).name;}
  const inner=[];
  for(const st of moved)walk(st,n=>{
    if(ts.isCallExpression(n)&&n.expression.getText(sf).startsWith('this.'))inner.push({start:n.getStart(sf),end:n.end,text:capture(n,n.expression.name.text)});
    if(!ts.isIdentifier(n))return;
    if((ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)||(ts.isPropertyAssignment(n.parent)&&n.parent.name===n))return;
    const sym=ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n);
    const d=sym?.valueDeclaration||sym?.declarations?.[0];if(!d||d.getSourceFile()!==sf||moved.some(m=>d.pos>=m.pos&&d.end<=m.end))return;
    if(ts.isParameter(d)||ts.isVariableDeclaration(d)) {
      // Arguments inside captured calls are evaluated by the service.
      let p=n.parent;while(p&&p!==st){if(ts.isCallExpression(p)&&p.expression.getText(sf).startsWith('this.'))return;p=p.parent;}
      capture(n);
    }
  });
  const queries=[];
  for(const call of transaction.arguments[0].elements){
    const rm=rc.members.find(m=>m.name?.getText(rf)===call.expression.name.text);
    const ret=rm.body.statements.find(ts.isReturnStatement).expression;
    const subs=[];
    walk(ret,n=>{
      if(!ts.isIdentifier(n))return;
      const i=rm.parameters.findIndex(p=>p.name.getText(rf)===n.text);if(i<0)return;
      if(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n)return;
      if(ts.isPropertyAssignment(n.parent)&&n.parent.name===n)return;
      let val;
      if(n.text==='db')val='this.prisma';else {
        const a=call.arguments[i];val=a.getText(sf);
        if(val!=='where')capture(a);
      }
      subs.push({start:n.getStart(rf)-ret.getStart(rf),end:n.end-ret.getStart(rf),text:val});
    });
    queries.push(edit(ret.getText(rf),subs));
    re.push({start:rm.getFullStart(),end:rm.end,text:''});
  }
  const name=['list','findAll'].includes(method.name.getText(sf))?'findPage':'find'+cap(method.name.getText(sf))+'Page';
  const body=moved.map(st=>edit(st.getText(sf),inner.filter(e=>e.start>=st.getStart(sf)&&e.end<=st.end).map(e=>({...e,start:e.start-st.getStart(sf),end:e.end-st.getStart(sf)})))).join('\n');
  add.push(`${name}(${[...captures.values()].map(c=>`${c.name}: ${c.type}`).join(', ')}) {\n${body}\nreturn this.prisma.$transaction([${queries.join(',\n')}]);\n}`);
  for(const st of moved)se.push({start:st.getStart(sf),end:st.end,text:''});
  se.push({start:transaction.getStart(sf),end:transaction.end,text:`this.repo.${name}(${[...captures.values()].map(c=>c.value).join(', ')})`});
 }
 if(add.length){re.push({start:rc.end-1,end:rc.end-1,text:add.join('\n\n')+'\n'});fs.writeFileSync(sf.fileName,edit(sf.text,se));fs.writeFileSync(rp,edit(rf.text,re));}
}
