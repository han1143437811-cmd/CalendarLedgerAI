const clone=value=>JSON.parse(JSON.stringify(value));
export const CORRECTION_LIMIT=100;
export const CORRECTION_COLLECTIONS={transactions:'账目',events:'日程',tasks:'待办',aiMemory:'偏好'};
const keyOf=(collection,row)=>collection==='aiMemory'?row.key:row.id;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function normalizeCorrections(input=[]) {
  if(!Array.isArray(input)||input.length>CORRECTION_LIMIT)throw new Error('纠正记录格式或数量无效。');
  const ids=new Set();
  return input.map(row=>{
    if(!row||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(row.id)||ids.has(row.id)||typeof row.operationId!=='string'||!Array.isArray(row.changes)||row.changes.length<1||row.changes.length>50||JSON.stringify(row).length>65000)throw new Error('纠正记录内容无效。');
    ids.add(row.id);
    const changes=row.changes.map(change=>{
      if(!Object.hasOwn(CORRECTION_COLLECTIONS,change.collection)||typeof change.key!=='string'||change.key.length>100||!change.before&&!change.after)throw new Error('纠正对象无效。');
      for(const value of [change.before,change.after])if(value&&(typeof value!=='object'||Array.isArray(value)||keyOf(change.collection,value)!==change.key))throw new Error('纠正对象与记录不匹配。');
      return {collection:change.collection,key:change.key,before:change.before?clone(change.before):null,after:change.after?clone(change.after):null};
    });
    return {id:row.id,operationId:row.operationId,label:String(row.label??'修改记录').slice(0,80),at:String(row.at??'').slice(0,40),source:row.source==='ai'?'ai':'manual',quote:String(row.quote??'').slice(0,300),changes,undone:row.undone===true,...(typeof row.revertedBy==='string'?{revertedBy:row.revertedBy.slice(0,100)}:{})};
  });
}
export function recordCorrection(state,before,after,{operationId,label,context={},id}) {
  if(context.skipCorrection)return null;
  const changes=[];let hasEdit=false;
  for(const collection of Object.keys(CORRECTION_COLLECTIONS)){
    const oldRows=new Map((before[collection]??[]).map(row=>[keyOf(collection,row),row]));
    const newRows=new Map((after[collection]??[]).map(row=>[keyOf(collection,row),row]));
    const edited=[...oldRows].filter(([key,row])=>newRows.has(key)&&!same(row,newRows.get(key)));
    if(!edited.length)continue;hasEdit=true;
    for(const [key,row] of edited)changes.push({collection,key,before:clone(row),after:clone(newRows.get(key))});
    // A repeated-event correction may also create a new exception/future series.
    if(collection==='events'){
      for(const [key,row] of newRows)if(!oldRows.has(key))changes.push({collection,key,before:null,after:clone(row)});
      for(const [key,row] of oldRows)if(!newRows.has(key))changes.push({collection,key,before:clone(row),after:null});
    }
  }
  if(!hasEdit||changes.length>50)return null;
  const quote=String(context.userPrompt??'').slice(0,300).replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g,'[密钥已隐藏]');
  const entry={id,operationId,label,at:new Date().toISOString(),source:context.userPrompt?'ai':'manual',quote,changes,undone:false};
  if(JSON.stringify(entry).length>65000)return null;
  state.correctionHistory=[...(state.correctionHistory??[]),entry].slice(-CORRECTION_LIMIT);
  return entry;
}
export function queryCorrections(state,{kind,query='',limit=20}={}){
  if(kind&&!Object.hasOwn(CORRECTION_COLLECTIONS,kind))throw new Error('纠正类型无效。');
  if(typeof query!=='string'||query.length>100||!Number.isInteger(limit)||limit<1||limit>50)throw new Error('纠正查询范围无效。');
  return (state.correctionHistory??[]).filter(row=>(!kind||row.changes.some(change=>change.collection===kind))&&(!query||JSON.stringify(row).includes(query))).slice(-limit).reverse().map(clone);
}
export function correctionSnapshot(state,entry,businessSnapshot){
  if(entry.undone||entry.revertedBy)throw new Error('这次纠正已撤销或已恢复旧值。');
  const next=clone(businessSnapshot);
  for(const change of entry.changes){
    const collection=change.collection,rows=next[collection],current=rows.find(row=>keyOf(collection,row)===change.key);
    if(!same(current??null,change.after))throw new Error('该对象后来又被修改或删除，请先查看当前内容；没有覆盖后续修改。');
    next[collection]=rows.filter(row=>keyOf(collection,row)!==change.key);
    if(change.before)next[collection].push(clone(change.before));
  }
  return next;
}
export function markCorrectionUndo(state,operationId){
  for(const row of state.correctionHistory??[]){if(row.operationId===operationId)row.undone=true;if(row.revertedBy===operationId)delete row.revertedBy;}
}
export function correctionFields(change){
  return [...new Set([...Object.keys(change.before??{}),...Object.keys(change.after??{})])].filter(field=>field!=='id'&&field!=='key'&&!same(change.before?.[field],change.after?.[field]));
}
