import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,dispatch,restoreBackup,eventsOn,dailyCosts} from '../core.mjs';
const now='2026-10-13',fresh=()=>createInitialState(now,false),call=(state,name,args={},context={})=>dispatch(state,name,args,{today:now,...context});
test('changing a saved preference records old/new values and exact user quote, cold backup retains history',()=>{
  const s=fresh();call(s,'remember_preference',{key:'默认账户',value:'微信'});assert.equal(s.correctionHistory.length,0);
  const r=call(s,'correct_preference',{key:'默认账户',value:'银行卡'},{userPrompt:'把默认账户改成银行卡'});assert.equal(r.ok,true);assert.equal(s.aiMemory.length,1);
  const row=s.correctionHistory[0];assert.equal(row.source,'ai');assert.equal(row.quote,'把默认账户改成银行卡');assert.equal(row.changes[0].before.value,'微信');assert.equal(row.changes[0].after.value,'银行卡');
  const cold=fresh();restoreBackup(cold,JSON.parse(call(s,'export_backup').data));assert.equal(cold.correctionHistory[0].id,row.id);
  assert.equal(call(cold,'revert_correction',{id:row.id}).ok,true);assert.equal(cold.aiMemory[0].value,'微信');assert.ok(cold.correctionHistory[0].revertedBy);
  call(cold,'undo_operation');assert.equal(cold.aiMemory[0].value,'银行卡');assert.equal(cold.correctionHistory[0].revertedBy,undefined);
});
test('a correction cannot overwrite a later edit or a deleted record',()=>{
  const s=fresh(),id=call(s,'create_transactions',{items:[{note:'午饭',amount:30}]}).items[0].id;
  call(s,'update_transaction',{id,amount:35});const first=s.correctionHistory[0].id;call(s,'update_transaction',{id,amount:40});
  const before=JSON.stringify(s);assert.equal(call(s,'revert_correction',{id:first}).ok,false);assert.equal(JSON.stringify(s),before);
  call(s,'delete_transactions',{ids:[id]});assert.equal(call(s,'revert_correction',{id:first}).ok,false);
});
test('restoring a payment correction updates daily cost projections without adding payments',()=>{
  const s=fresh(),id=call(s,'create_transactions',{items:[{note:'月订阅',amount:30,date:'2026-10-01'}]}).items[0].id;
  call(s,'allocate_expense',{transactionIds:[id]});call(s,'update_transaction',{id,amount:62});const row=s.correctionHistory[0];
  assert.equal(call(s,'revert_correction',{id:row.id}).ok,true);assert.equal(s.transactions.length,1);assert.equal(dailyCosts(s).expense,3000);
});
test('repeated-event correction restores the affected source and removes its created exception only',()=>{
  const s=fresh(),id=call(s,'create_event',{title:'健身',date:'2026-10-05',time:'19:00',repeat:'weekly'}).items[0].id;
  call(s,'update_event',{id,scope:'occurrence',occurrenceDate:'2026-10-12',time:'20:00'});const row=s.correctionHistory[0];assert.equal(row.changes.length,2);
  assert.equal(call(s,'revert_correction',{id:row.id}).ok,true);assert.equal(s.events.length,1);assert.equal(eventsOn(s,'2026-10-12')[0].time,'19:00');
});
test('ordinary undo marks correction as undone while retaining the audit record',()=>{
  const s=fresh();call(s,'remember_preference',{key:'账户',value:'微信'});call(s,'remember_preference',{key:'账户',value:'现金'});call(s,'undo_operation');
  assert.equal(s.aiMemory[0].value,'微信');assert.equal(s.correctionHistory.length,1);assert.equal(s.correctionHistory[0].undone,true);assert.equal(call(s,'revert_correction',{id:s.correctionHistory[0].id}).ok,false);
});
test('history is bounded, unchanged updates and failed updates do not produce corrections',()=>{
  const s=fresh();call(s,'remember_preference',{key:'账户',value:'微信'});call(s,'remember_preference',{key:'账户',value:'微信'});assert.equal(s.correctionHistory.length,0);
  for(let i=0;i<105;i++)call(s,'correct_preference',{key:'账户',value:'账户'+i});assert.equal(s.correctionHistory.length,100);
  const count=s.correctionHistory.length;assert.equal(call(s,'correct_preference',{key:'不存在',value:'微信'}).ok,false);assert.equal(s.correctionHistory.length,count);
});
test('native JSON key reordering does not produce a false later-edit conflict',()=>{
  const s=fresh();call(s,'remember_preference',{key:'账户',value:'微信'});call(s,'correct_preference',{key:'账户',value:'银行卡'});s.aiMemory[0]={value:'银行卡',key:'账户'};
  assert.equal(call(s,'revert_correction',{id:s.correctionHistory[0].id}).ok,true);
});
test('old backups load with empty correction history and malformed histories are atomic',()=>{
  const s=fresh(),old=fresh();delete old.correctionHistory;restoreBackup(s,old);assert.deepEqual(s.correctionHistory,[]);
  const before=JSON.stringify(s);assert.throws(()=>restoreBackup(s,{...old,correctionHistory:[{id:'x',operationId:'o',changes:[{collection:'bad',key:'x',before:{id:'x'},after:{id:'x'}}]}]}));assert.equal(JSON.stringify(s),before);
});
