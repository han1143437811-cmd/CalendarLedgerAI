import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,dispatch,restoreBackup,TOOLS} from '../core.mjs';
import {compactChat,buildConversationContext,selectMemories,searchChatHistory} from '../ai-context.mjs';
const fresh=()=>createInitialState('2026-10-13',false);
const quote='我习惯用银行卡支付';
const candidate={key:'默认账户',value:'银行卡',evidence:quote};
const propose=state=>dispatch(state,'propose_preference',candidate,{userPrompt:quote});

test('inferred preference remains pending and cannot set an active default',()=>{
  const state=fresh();assert.equal(propose(state).ok,true);assert.equal(state.aiMemory.length,0);
  assert.equal(state.aiMemorySuggestions[0].evidence,quote);
  assert.equal(TOOLS.some(tool=>tool.function.name==='accept_memory_suggestion'),false);
  assert.equal(dispatch(state,'search_ai_memory',{query:'银行卡'}).items.length,0);
});
test('fabricated or screenshot-only evidence cannot become a suggestion',()=>{
  const state=fresh();assert.equal(dispatch(state,'propose_preference',candidate,{userPrompt:'午饭35元'}).ok,false);
  assert.equal(state.aiMemorySuggestions.length,0);assert.equal(state.undo.length,0);
  assert.equal(dispatch(state,'propose_preference',candidate).ok,false);
});
test('confirming an updated suggestion replaces the same preference and can be undone',()=>{
  const state=fresh();dispatch(state,'remember_preference',{key:'默认账户',value:'微信'});
  propose(state);assert.equal(state.aiMemory[0].value,'微信');
  const id=state.aiMemorySuggestions[0].id;const result=dispatch(state,'accept_memory_suggestion',{id});
  assert.equal(result.ok,true);assert.deepEqual(state.aiMemory,[{key:'默认账户',value:'银行卡',evidence:quote}]);assert.equal(state.aiMemorySuggestions.length,0);
  dispatch(state,'undo_operation');assert.equal(state.aiMemory[0].value,'微信');assert.equal(state.aiMemorySuggestions[0].id,id);
});
test('suggestion policy, dismissing and cold restoration work without touching business records',()=>{
  const state=fresh();propose(state);const restored=fresh();restoreBackup(restored,JSON.parse(JSON.stringify(state)));
  assert.equal(restored.aiMemorySuggestions.length,1);dispatch(restored,'dismiss_memory_suggestion',{id:restored.aiMemorySuggestions[0].id});
  dispatch(restored,'update_memory_policy',{suggestions:false});assert.equal(propose(restored).ok,false);
  const cold=fresh();restoreBackup(cold,restored);assert.equal(cold.aiMemoryPolicy.suggestions,false);assert.equal(cold.transactions.length,0);
});
test('old v0.3.4 backup upgrades with defaults and preserves explicit memories',()=>{
  const state=fresh();delete state.aiMemorySuggestions;delete state.aiMemoryPolicy;delete state.aiChatArchive;
  state.aiMemory=[{key:'分摊规则',value:'保留付款按天分摊'}];const upgraded=fresh();restoreBackup(upgraded,state);
  assert.equal(upgraded.aiMemory[0].value,'保留付款按天分摊');assert.deepEqual(upgraded.aiMemorySuggestions,[]);
});
test('credential-shaped preference and evidence are rejected',()=>{
  const state=fresh();const secret='sk-'+ 'x'.repeat(25);
  assert.equal(dispatch(state,'propose_preference',{...candidate,evidence:'我的密钥是'+secret},{userPrompt:'我的密钥是'+secret}).ok,false);
});
test('relevant preference wins the context budget and does not appear twice in application facts',()=>{
  const state=fresh();state.aiMemory=Array.from({length:39},(_,i)=>({key:'无关偏好'+i,value:'关于健身的一些说明'.repeat(25)}));
  state.aiMemory.unshift({key:'订阅分摊',value:'月订阅保留付款按天分摊'});
  const selected=selectMemories(state,'分摊订阅',500);assert.equal(selected[0].key,'订阅分摊');assert.ok(JSON.stringify(selected).length<=520);
  const wire=buildConversationContext(state,{prompt:'分摊订阅',today:'2026-10-13',timeZone:'Asia/Singapore',appContext:{aiMemory:state.aiMemory}})[0].content;
  assert.equal(wire.split('月订阅保留付款按天分摊').length-1,1);
});
test('Chinese keyword retrieval recalls a distant user request and its actual ID',()=>{
  const state=fresh();state.chat=[{role:'user',text:'我的健身年费明年三月到期'},...Array.from({length:30},()=>({role:'assistant',text:'好的'}))];
  assert.equal(searchChatHistory(state,'健身 到期')[0].text,'我的健身年费明年三月到期');
  const wire=buildConversationContext(state,{prompt:'健身到期是什么时候',today:'2026-10-13',timeZone:'Asia/Singapore'})[0].content;
  assert.ok(wire.includes('我的健身年费明年三月到期'));
});
test('chat compaction preserves exact user excerpts and successful operations, not unsupported assistant claims',()=>{
  const state=fresh();state.chat=[{role:'user',text:'健身年费明年三月到期'},{role:'assistant',text:'已经为你付款999元'},
    {role:'assistant',text:'登记成功',results:[{name:'create_transactions',result:{ok:true,operationId:'op_1',items:[{id:'tx_1',amount:3000,note:'健身年费'}]}}]},
    ...Array.from({length:200},()=>({role:'user',text:'天气'}))];
  compactChat(state);assert.equal(state.chat.length,200);assert.equal(state.aiChatArchive.length,2);
  assert.equal(JSON.stringify(state.aiChatArchive).includes('999'),false);
  assert.ok(JSON.stringify(state.aiChatArchive).includes('tx_1'));assert.equal(searchChatHistory(state,'健身')[0].archived,true);
  compactChat(state);assert.equal(state.aiChatArchive.length,2);
});
test('history archive has a fixed upper bound and no cross-instance recall',()=>{
  const state=fresh();state.chat=Array.from({length:500},(_,i)=>({role:'user',text:'消息'+i}));compactChat(state);
  assert.equal(state.aiChatArchive.length,80);assert.equal(searchChatHistory(fresh(),'消息').length,0);
});
