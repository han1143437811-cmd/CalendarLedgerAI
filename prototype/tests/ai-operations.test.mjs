import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,dispatch,cashflow,dailyCosts,restoreBackup,TOOLS} from '../core.mjs';
import {dailyShare,allocationDays,projectDailyCosts} from '../expense-allocation.mjs';
import {buildConversationContext,savedToolResult} from '../ai-context.mjs';
import {runToolConversation} from '../ai-agent.mjs';
import {runDemo} from '../demo.mjs';

const today='2026-10-13';
const fresh=()=>createInitialState(today,false);
function payment(state,amount=30,date='2026-10-01',note='月订阅会员') {
  const result=dispatch(state,'create_transactions',{items:[{note,amount,date,category:'娱乐'}]},{today});
  assert.equal(result.ok,true);return result.items[0].id;
}
const allocate=(state,id,args={})=>dispatch(state,'allocate_expense',{transactionIds:[id],...args},{today});
const context=(state,prompt)=>buildConversationContext(state,{prompt,today,timeZone:'Asia/Singapore',appContext:dispatch(state,'get_app_context',{}, {today})});
const call=(id,name,args)=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const assistant=calls=>({message:{role:'assistant',content:null,tool_calls:calls}});
const done=text=>({message:{role:'assistant',content:text}});
const reads=new Set(['search_transactions','query_cashflow','get_app_context','get_ai_memory','query_daily_costs']);

test('30 yuan allocation conserves cents on every month length and never adds actual payments',()=>{
  const state=fresh(),id=payment(state);assert.equal(allocate(state,id).ok,true);
  assert.equal(state.transactions.length,1);assert.equal(cashflow(state).expense,3000);
  const records=projectDailyCosts(state,'2026-10-01','2026-10-31');
  assert.equal(records.length,31);assert.equal(records.reduce((sum,row)=>sum+row.amount,0),3000);
  assert.equal(records[0].amount,97);assert.equal(records.at(-1).amount,96);
  for(const [start,end,days] of [['2026-02-01','2026-02-28',28],['2024-02-01','2024-02-29',29],['2026-04-01','2026-04-30',30]]){
    assert.equal(allocationDays(start,end),days);
    const s=fresh(),source=payment(s);assert.equal(allocate(s,source,{start,end}).ok,true);
    assert.equal(projectDailyCosts(s,start,end).reduce((sum,row)=>sum+row.amount,0),3000);
  }
});
test('cross-month service period does not depend on original payment date',()=>{
  const state=fresh(),id=payment(state,30,'2026-09-15');allocate(state,id,{start:'2026-09-20',end:'2026-10-19'});
  assert.equal(cashflow(state).expense,0);assert.equal(dailyCosts(state).expense,1900);
  assert.equal(dailyCosts(state,{start:'2026-09-20',end:'2026-10-19'}).expense,3000);
  assert.equal(dailyShare(3000,'2026-09-20','2026-10-19','2026-10-20'),0);
});
test('same allocation is idempotent; update amount changes shares; undo restores the exact original',()=>{
  const state=fresh(),id=payment(state);allocate(state,id);const undoCount=state.undo.length;
  const repeat=allocate(state,id);assert.equal(repeat.unchanged,true);assert.equal(state.undo.length,undoCount);
  dispatch(state,'update_transaction',{id,amount:62});assert.equal(dailyCosts(state).expense,6200);
  dispatch(state,'undo_operation',{});assert.equal(dailyCosts(state).expense,3000);
  dispatch(state,'undo_operation',{});assert.equal(state.expenseAllocations.length,0);assert.equal(state.transactions[0].amount,3000);
});
test('invalid multi-payment allocation is atomic; delete and undo keep linked plans coherent',()=>{
  const state=fresh(),id=payment(state),other=dispatch(state,'create_transactions',{items:[{note:'工资',amount:100,kind:'income'}]}).items[0].id;
  const previous=JSON.stringify(state);assert.equal(dispatch(state,'allocate_expense',{transactionIds:[id,other]}).ok,false);assert.equal(JSON.stringify(state),previous);
  for(const args of [{start:'2026-02-30',end:'2026-03-02'},{start:'2026-10-02',end:'2026-10-01'},{month:'2026-13'},{start:'2026-10-01'},{month:'2026-10',start:'2026-10-01',end:'2026-10-02'}])assert.equal(allocate(state,id,args).ok,false);
  allocate(state,id);assert.equal(dispatch(state,'update_transaction',{id,kind:'income'}).ok,false);
  dispatch(state,'delete_transactions',{ids:[id]});assert.equal(state.expenseAllocations.length,0);
  dispatch(state,'undo_operation',{});assert.equal(state.expenseAllocations.length,1);
});
test('one cent distributed over a month has no fabricated zero-value transactions',()=>{
  const state=fresh(),id=payment(state,0.01);allocate(state,id);
  const rows=projectDailyCosts(state,'2026-10-01','2026-10-31');assert.equal(rows.length,1);assert.equal(rows[0].amount,1);
  assert.equal(state.transactions.length,1);
});
test('daily cost queries retain category/account/ledger filters and actual refund rules',()=>{
  const state=fresh(),id=payment(state);allocate(state,id);
  payment(state,10,today,'日常消费');dispatch(state,'create_transactions',{items:[{note:'退款',amount:2,date:today,kind:'refund',category:'娱乐'}]});
  assert.equal(dailyCosts(state,{start:today,end:today}).expense,897);
  assert.equal(dailyCosts(state,{excludeAccounts:['微信']}).expense,0);
  assert.equal(cashflow(state).expense,3800);
});
test('backup and cold load retain memories and allocation; old backups and old undo still work',()=>{
  const state=fresh(),id=payment(state);allocate(state,id);dispatch(state,'remember_preference',{key:'订阅规则',value:'保留付款，按天分摊'});
  const backup=JSON.parse(dispatch(state,'export_backup').data), loaded=fresh();restoreBackup(loaded,backup);
  assert.equal(loaded.aiMemory[0].value,'保留付款，按天分摊');assert.equal(dailyCosts(loaded).expense,3000);
  delete backup.aiMemory;delete backup.expenseAllocations;restoreBackup(loaded,backup);assert.deepEqual(loaded.aiMemory,[]);assert.deepEqual(loaded.expenseAllocations,[]);
  const oldBefore={...backup};loaded.undo=[{id:'old_op',label:'旧操作',before:oldBefore}];assert.equal(dispatch(loaded,'undo_operation',{}).ok,true);
});
test('memories update by name, can be forgotten and undone, and have bounded validated storage',()=>{
  const state=fresh();dispatch(state,'remember_preference',{key:'默认账户',value:'银行卡'});dispatch(state,'remember_preference',{key:'默认账户',value:'微信'});
  assert.equal(state.aiMemory.length,1);assert.equal(state.aiMemory[0].value,'微信');
  dispatch(state,'forget_preference',{key:'默认账户'});assert.equal(state.aiMemory.length,0);dispatch(state,'undo_operation',{});assert.equal(state.aiMemory[0].value,'微信');
  assert.equal(dispatch(state,'remember_preference',{key:'x',value:'x'.repeat(301)}).ok,false);
  const snapshot=JSON.parse(JSON.stringify(state));assert.equal(snapshot.aiMemory[0].value,'微信');
});
test('cold conversation reconstructs text, record IDs, memory and operations without resending images',()=>{
  const state=fresh(),id=payment(state);state.aiMemory=[{key:'订阅规则',value:'保留付款按天分摊'}];
  state.chat=[{role:'user',text:'记月订阅30元',images:[{dataURL:'SECRET_IMAGE_DATA'}]},{role:'assistant',text:'已记账',results:[{name:'create_transactions',result:{ok:true,type:'transaction',items:[state.transactions[0]]}}]},{role:'user',text:'把刚才那笔均摊'}];
  const loaded=JSON.parse(JSON.stringify(state)), messages=context(loaded,'把刚才那笔均摊');
  const wire=JSON.stringify(messages);assert.ok(wire.includes(id));assert.ok(wire.includes('保留付款按天分摊'));assert.ok(wire.includes('记月订阅30元'));assert.ok(!wire.includes('SECRET_IMAGE_DATA'));
  assert.equal(messages.filter(row=>row.role==='user'&&row.content==='把刚才那笔均摊').length,1);
  assert.ok(messages[0].content.includes('allocate_expense'));
});
test('history search returns older messages and rejects invalid limits',()=>{
  const state=fresh();state.chat=Array.from({length:80},(_,i)=>({role:'user',text:i===0?'月订阅用银行卡':'普通对话'+i}));
  const result=dispatch(state,'search_chat_history',{query:'月订阅'});assert.equal(result.items.length,1);
  assert.equal(dispatch(state,'search_chat_history',{query:'',limit:99}).ok,false);
  assert.equal(context(state,'继续').length,26);
});
test('API tool loop re-queries after a write and deduplicates canonical identical writes',async()=>{
  const state=fresh();let turn=0,queryValues=[],writes=0;
  const replies=[assistant([call('q1','query_cashflow',{})]),assistant([call('w1','create_transactions',{items:[{amount:30,note:'订阅'}]}),call('w2','create_transactions',{items:[{note:'订阅',amount:30}]})]),assistant([call('q2','query_cashflow',{})]),done('已经完成')];
  const result=await runToolConversation({messages:context(state,'记账'),tools:TOOLS,request:async()=>replies[turn++],isReadOnly:name=>reads.has(name),describe:r=>r.ok?'成功':r.error,
    execute:(name,args)=>{const result=dispatch(state,name,args,{today});if(name==='query_cashflow')queryValues.push(result.expense);if(name==='create_transactions')writes++;return result;}});
  assert.deepEqual(queryValues,[0,3000]);assert.equal(writes,1);assert.equal(state.transactions.length,1);assert.equal(result.text,'已经完成');
});
test('tool failure can be corrected; missing required nested fields never perform a write',async()=>{
  const state=fresh();let turn=0;
  const replies=[assistant([call('bad','create_transactions',{items:[{amount:30}]})]),assistant([call('good','create_transactions',{items:[{amount:30,note:'订阅'}]})]),done('已修正')];
  const result=await runToolConversation({messages:context(state,'记账'),tools:TOOLS,request:async()=>replies[turn++],isReadOnly:name=>reads.has(name),execute:(name,args)=>dispatch(state,name,args,{today}),describe:r=>r.error??'成功'});
  assert.equal(result.results[0].result.ok,false);assert.equal(state.transactions.length,1);
});
test('provider outage preserves completed operations and all rounds return paired tool responses',async()=>{
  const state=fresh();let turn=0;const messages=context(state,'记账');
  await assert.rejects(runToolConversation({messages,tools:TOOLS,request:async()=>{if(turn++)throw new Error('模拟断网');return assistant([call('write','create_transactions',{items:[{amount:30,note:'订阅'}]})]);},isReadOnly:name=>reads.has(name),execute:(name,args)=>dispatch(state,name,args,{today}),describe:()=>''}),error=>error.completedResults[0].result.ok===true);
  assert.equal(state.transactions.length,1);assert.equal(messages.at(-1).tool_call_id,'write');
});
test('search → allocate → verify → remember supports an entire operation with a mock API',async()=>{
  const state=fresh(),id=payment(state);let turn=0;
  const replies=[assistant([call('find','search_transactions',{query:'月订阅'})]),assistant([call('spread','allocate_expense',{transactionIds:[id]})]),assistant([call('verify','query_daily_costs',{})]),assistant([call('memory','remember_preference',{key:'订阅分摊',value:'保留实际付款，按天分摊'})]),done('已分摊并记住规则')];
  await runToolConversation({messages:context(state,'均摊并记住'),tools:TOOLS,request:async()=>replies[turn++],isReadOnly:name=>reads.has(name),execute:(name,args)=>dispatch(state,name,args,{today}),describe:()=>''});
  assert.equal(state.expenseAllocations.length,1);assert.equal(state.aiMemory.length,1);assert.equal(state.transactions.length,1);assert.equal(dailyCosts(state).expense,3000);
});
test('completion claim without actual allocation triggers a repair instead of false success',async()=>{
  const state=fresh(),id=payment(state);let turn=0;
  const replies=[done('已经完成均摊。'),assistant([call('spread','allocate_expense',{transactionIds:[id]})]),done('已分摊。')];
  await runToolConversation({prompt:'把月订阅均摊',messages:context(state,'把月订阅均摊'),tools:TOOLS,request:async()=>replies[turn++],isReadOnly:name=>reads.has(name),execute:(name,args)=>dispatch(state,name,args,{today}),describe:()=>''});
  assert.equal(turn,3);assert.equal(state.expenseAllocations.length,1);assert.equal(state.transactions.length,1);
});
test('repeated unsupported completion claim does not masquerade as successful memory',async()=>{
  const state=fresh();let requests=0;
  const result=await runToolConversation({prompt:'记住我的默认账户',messages:context(state,'记住我的默认账户'),tools:TOOLS,request:async()=>{requests++;return done('已记住。');},isReadOnly:name=>reads.has(name),execute:()=>assert.fail('should not execute'),describe:()=>''});
  assert.equal(requests,2);assert.equal(state.aiMemory.length,0);assert.ok(result.text.includes('尚未'));
});
test('local demonstration supports subscription allocation, explicit memory and follow-up amount changes',()=>{
  const state=fresh();runDemo(state,'2026-10-01 月订阅30元',today);runDemo(state,'把刚才那笔均摊到每天',today);
  runDemo(state,'记住，我的月订阅保留付款按天分摊',today);
  const loaded=JSON.parse(JSON.stringify(state));runDemo(loaded,'刚才那笔改成62',today);
  assert.equal(loaded.transactions.length,1);assert.equal(dailyCosts(loaded).expense,6200);assert.equal(loaded.aiMemory.length,1);
});
test('credential-like memory is rejected without mutating preferences or undo history',()=>{
  const state=fresh();assert.equal(dispatch(state,'remember_preference',{key:'API Key',value:'private-value'}).ok,false);
  assert.equal(dispatch(state,'remember_preference',{key:'默认服务',value:'sk-'+'x'.repeat(40)}).ok,false);
  assert.equal(state.aiMemory.length,0);assert.equal(state.undo.length,0);
});
test('large allocation books do not dump all plans into every model request',()=>{
  const state=fresh();state.expenseAllocations=Array.from({length:20000},(_,i)=>({id:'allocation_'+i,transactionId:'tx_'+i,start:'2026-10-01',end:'2026-10-31'}));
  const app=dispatch(state,'get_app_context',{}, {today});assert.equal(app.expenseAllocations.length,20);assert.equal(app.expenseAllocationCount,20000);
  assert.ok(JSON.stringify(context(state,'继续')).length<20000);
});
test('later editing does not rewrite saved operation history; recognition cards remain live',()=>{
  const state=fresh();const created=dispatch(state,'create_transactions',{items:[{note:'月订阅',amount:30}]});
  const saved=savedToolResult(created);dispatch(state,'update_transaction',{id:created.items[0].id,amount:62});
  assert.equal(saved.items[0].amount,3000);assert.equal(state.transactions[0].amount,6200);
  const draft={ok:true,type:'drafts',records:[]};assert.equal(savedToolResult(draft),draft);
});
test('API exports retain file bytes for the downloader but omit them from saved chat history',async()=>{
  const state=fresh();let step=0,downloaded;
  const replies=[assistant([call('export','export_backup',{})]),done('已导出')];
  const result=await runToolConversation({messages:context(state,'导出备份'),tools:TOOLS,request:async()=>replies[step++],execute:(name,args)=>dispatch(state,name,args,{today}),isReadOnly:name=>reads.has(name),onResult:entry=>{downloaded=entry.result.data;},describe:()=>''});
  assert.equal(JSON.parse(downloaded).version,1);assert.equal(savedToolResult(result.results[0].result).data,undefined);
});
