/* Dependency closure only: retained engine definitions are never rewritten. */
import assert from 'node:assert/strict';
import {parse} from 'acorn';
import escodegen from 'escodegen';

const ast=source=>parse(source,{ecmaVersion:'latest',sourceType:'script'});
const shape=value=>JSON.parse(JSON.stringify(value,(key,value)=>['start','end','raw'].includes(key)?undefined:value));
const expression=source=>ast('('+source+');').body[0].expression;
function walk(node,visit,parent=null,key=null) {
  if(!node || typeof node!=='object')return;
  visit(node,parent,key);
  for(const [name,value] of Object.entries(node)) {
    if(Array.isArray(value))value.forEach(child=>walk(child,visit,node,name));
    else if(value && typeof value==='object')walk(value,visit,node,name);
  }
}
function inert(node) {
  if(!node)return false;
  if(['Literal','FunctionExpression','ArrowFunctionExpression'].includes(node.type))return true;
  if(node.type==='ArrayExpression')return node.elements.every(inert);
  if(node.type==='ObjectExpression')return node.properties.every(property=>property.type==='Property' &&
    property.kind==='init' && !property.computed && !property.method && inert(property.value));
  return false;
}
function subset(source,requested,namespace) {
  const tree=ast(source),original=shape(tree);
  assert.equal(tree.body.length,1,'Engine must contain one UMD wrapper');
  const call=tree.body[0].expression,fn=call?.callee;
  assert.equal(tree.body[0].type,'ExpressionStatement');
  assert.equal(call?.type,'CallExpression');
  assert.equal(fn?.type,'FunctionExpression');
  assert.deepEqual(shape(fn.params),[{type:'Identifier',name:'root'}]);
  assert.equal(fn.async,false);assert.equal(fn.generator,false);assert.equal(fn.id,null);
  assert.deepEqual(shape(call.arguments),[shape(expression("typeof window!=='undefined'?window:this"))]);
  const body=fn.body.body,decls=new Map(),definitions=[];
  assert.equal(body[0]?.directive,'use strict');
  const exportStatements=ast("if(typeof module!=='undefined' && module.exports) module.exports=API; if(root) root."+namespace+'=API;').body;
  assert.deepEqual(shape(body.slice(-2)),shape(exportStatements),'Only the known UMD exports may have top-level effects');
  const api=body.at(-3);
  assert.equal(api?.type,'VariableDeclaration');assert.equal(api.kind,'const');assert.equal(api.declarations.length,1);
  const apiDeclaration=api.declarations[0];assert.equal(apiDeclaration.id.name,'API');assert.equal(apiDeclaration.init.type,'ObjectExpression');
  for(const node of body.slice(1,-3)) {
    assert.ok(['FunctionDeclaration','VariableDeclaration'].includes(node.type),'Unsupported top-level engine effect');
    if(node.type==='VariableDeclaration')assert.equal(node.kind,'const');
    const names=node.type==='FunctionDeclaration'?[node.id]:node.declarations.map(value=>value.id);
    for(const name of names) {
      assert.equal(name?.type,'Identifier','Top-level destructuring is unsupported');
      assert.ok(!decls.has(name.name) && !['API','root','module','require'].includes(name.name),'Unique, ordinary top-level bindings required');
      decls.set(name.name,node);
    }
    if(node.type==='VariableDeclaration')for(const declaration of node.declarations) {
      if(declaration.id.name==='RULES')assert.deepEqual(shape(declaration.init),shape(expression("typeof module!=='undefined' && module.exports?require('./smartlink-engine.js'):root.BOOM_SMARTLINK")));
      else assert.ok(inert(declaration.init),'Removing a top-level initializer must not remove effects');
    }
    definitions.push(node);
  }
  const properties=apiDeclaration.init.properties,exportNames=new Set();
  for(const property of properties) {
    assert.ok(property.type==='Property' && property.kind==='init' && property.shorthand && !property.computed && !property.method);
    assert.equal(property.key.type,'Identifier');assert.equal(property.value.type,'Identifier');
    assert.equal(property.key.name,property.value.name);assert.ok(decls.has(property.value.name));
    assert.ok(!exportNames.has(property.key.name));exportNames.add(property.key.name);
  }
  assert.equal(new Set(requested).size,requested.length);
  for(const name of requested)assert.ok(exportNames.has(name),'Requested engine export is missing: '+name);
  const selected=new Set(),pending=[...requested];
  while(pending.length) {
    const node=decls.get(pending.pop());assert.ok(node);
    if(selected.has(node))continue;
    selected.add(node);
    const rulesBridge=node.type==='VariableDeclaration' && node.declarations.length===1 && node.declarations[0].id.name==='RULES';
    /* Conservative references also retain harmless names shadowed by locals. */
    walk(node,value=>{
      if(value.type==='Identifier' && decls.has(value.name) && !selected.has(decls.get(value.name)))pending.push(value.name);
      if(value.type==='Identifier')assert.ok(!['eval','Function','AsyncFunction','GeneratorFunction'].includes(value.name),'Dynamic code cannot be dependency-pruned');
      if(value.type==='Identifier' && !rulesBridge)assert.ok(!['API','root','module','require'].includes(value.name),'Definitions cannot inspect or dynamically load module exports');
      assert.notEqual(value.type,'ImportExpression','Dynamic imports cannot be dependency-pruned');
    });
  }
  apiDeclaration.init.properties=properties.filter(property=>requested.includes(property.key.name));
  fn.body.body=[body[0],...definitions.filter(node=>selected.has(node)),api,...body.slice(-2)];
  const printed=escodegen.generate(tree,{comment:false,format:{compact:true,semicolons:true,parentheses:true,escapeless:false}})+'\n';
  const reparsed=ast(printed);
  assert.deepEqual(shape(reparsed),shape(tree),'Subset printing must preserve its AST');
  const originalDefinitions=original.body[0].expression.callee.body.body.slice(1,-3);
  for(const node of definitions.filter(value=>selected.has(value)))assert.ok(originalDefinitions.some(value=>JSON.stringify(value)===JSON.stringify(shape(node))),'Retained definitions must be unchanged');
  return {code:printed,tree:reparsed,names:[...decls].filter(([,node])=>selected.has(node)).map(([name])=>name)};
}
export function buildMergeSubset(rules,share) {
  const selectedShare=subset(share,['combineFrames','MAX_BYTES'],'BOOM_SMARTLINK_SHARE');
  const members=new Set();
  walk(selectedShare.tree,(node,parent,key)=>{
    if(node.type==='Identifier' && node.name==='RULES') {
      if(parent?.type==='VariableDeclarator' && key==='id')return;
      assert.ok(parent?.type==='MemberExpression' && key==='object' && !parent.computed && parent.property.type==='Identifier','RULES dependencies must use static member access');
      members.add(parent.property.name);
    }
  });
  const selectedRules=subset(rules,[...members],'BOOM_SMARTLINK');
  return {rules:selectedRules.code,share:selectedShare.code,retained:{rules:selectedRules.names,share:selectedShare.names}};
}
