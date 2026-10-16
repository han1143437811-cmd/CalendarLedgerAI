import test from 'node:test';
import assert from 'node:assert/strict';
import {completionOptions} from '../ai-options.mjs';
import {compressConversation,needsSummary,summaryCandidates} from '../ai-summary.mjs';
import {buildConversationContext,savedAPIMessageBlock} from '../ai-context.mjs';
import {runToolConversation} from '../ai-agent.mjs';
import {createInitialState,TOOLS,dispatch} from '../core.mjs';
const base='https://api.deepseek.com';
const history=n=>Array.from({length:n},(_,i)=>({id:'msg_'+i,role:i%2?'assistant':'user',text:i%2?'尚需确认':'订阅规则'+i}));
const state=()=>({...createInitialState('2026-10-13',false),chat:history(32)});
test('four slider positions produce official DeepSeek options while other providers stay unchanged',()=>{
  for(const effort of ['none','low','high','max']){const options=completionOptions(base,effort);assert.equal(options.reasoning_effort,effort);assert.equal(options.thinking.type,effort==='none'?'disabled':'enabled');assert.ok(options.max_tokens>=2048);}
  assert.deepEqual(completionOptions('https://example.org','max'),{max_tokens:8192});assert.throws(()=>completionOptions(base,'fake'));
});
test('summary uses no thinking, a bounded JSON answer and leaves the most recent three turns untouched',async()=>{
  const s=state(),original=JSON.stringify(s.chat);let calls=0;
  const result=await compressConversation(s,{model:'deepseek-flash',request:async body=>{calls++;assert.equal(body.purpose,'summary');const data=JSON.parse(body.messages[1].content);assert.equal(data.excerpts.length,26);return {message:{content:JSON.stringify({summary:'订阅规则待核对，尚未写入账目。'})}};}});
  assert.equal(calls,1);assert.equal(result.changed,true);assert.equal(s.aiSummary.throughId,'msg_25');assert.equal(JSON.stringify(s.chat),original);
  assert.equal(summaryCandidates(s).length,0);assert.equal(needsSummary(s),false);assert.equal(s.transactions.length,0);
  const options=completionOptions(base,'max',{summary:true});assert.equal(options.reasoning_effort,'none');assert.equal(options.max_tokens,4096);
});
test('failed or malformed summaries fall back to labeled excerpts without changing conversation or actual records',async()=>{
  for(const content of ['bad json','{}',JSON.stringify({summary:'x'.repeat(4000)})]){const s=state(),chat=JSON.stringify(s.chat),records=JSON.stringify(s.transactions);const result=await compressConversation(s,{model:'test',request:async()=>({message:{content}})});assert.equal(result.source,'local');assert.equal(JSON.stringify(s.chat),chat);assert.equal(JSON.stringify(s.transactions),records);assert.match(s.aiSummary.text,/本地原话摘录/);}
});
test('large summary request has valid JSON and only marks actually supplied turns as covered',async()=>{
  const s=state();s.chat=history(200).map(row=>({...row,text:'原话'.repeat(1000)}));let sent;
  await compressConversation(s,{model:'test',force:true,request:async body=>{sent=JSON.parse(body.messages[1].content);assert.ok(body.messages[1].content.length<60000);return {message:{content:'{"summary":"阶段性摘要"}'}};}});
  assert.ok(sent.excerpts.length<194);assert.equal(s.aiSummary.throughId,'msg_'+(sent.excerpts.length-1));assert.ok(summaryCandidates(s).length>0);
});
test('thinking tool loop and subsequent cold context retain exact reasoning plus paired tool results',async()=>{
  const s=createInitialState('2026-10-13',false),messages=[{role:'user',content:'查偏好'}];let turn=0;
  const reply=await runToolConversation({messages,tools:TOOLS,isReadOnly:()=>true,describe:()=>'',execute:(name,args)=>dispatch(s,name,args),request:async body=>{
    if(!turn++)return {message:{role:'assistant',content:null,reasoning_content:'我需要查询真实偏好。',tool_calls:[{id:'q1',type:'function',function:{name:'get_ai_memory',arguments:'{}'}}]}};
    assert.equal(body.messages[1].reasoning_content,'我需要查询真实偏好。');assert.equal(body.messages[2].tool_call_id,'q1');return {message:{role:'assistant',content:'还没有偏好。',reasoning_content:'查询为空。'}};
  }});
  s.chat=[{id:'u',role:'user',text:'查偏好'},{id:'a',role:'assistant',text:reply.text,apiModel:'deepseek-flash',apiBaseURL:base,apiMessages:reply.apiMessages}];
  const wire=buildConversationContext(JSON.parse(JSON.stringify(s)),{prompt:'继续',today:'2026-10-13',timeZone:'Asia/Singapore',thinking:true,model:'deepseek-flash',baseURL:base});
  assert.ok(wire.some(row=>row.reasoning_content==='我需要查询真实偏好。'));assert.ok(wire.some(row=>row.tool_call_id==='q1'));
  const changed=buildConversationContext(s,{prompt:'继续',today:'2026-10-13',timeZone:'Asia/Singapore',thinking:true,model:'deepseek-v4-pro',baseURL:base});assert.equal(changed.some(row=>row.tool_calls),false);assert.equal(changed.some(row=>row.role==='assistant'),false);
});
test('summary is labeled historical data and covered raw dialogue does not inflate the next context',async()=>{
  const s=state();await compressConversation(s,{model:'test',request:async()=>({message:{content:'{"summary":"用户希望订阅分摊，需查询付款ID。"}'}})});
  const wire=buildConversationContext(s,{prompt:'继续',today:'2026-10-13',timeZone:'Asia/Singapore'});assert.ok(wire[0].content.includes('不能代替真实状态'));assert.equal(wire.some(row=>row.content==='订阅规则0'),false);assert.ok(wire.some(row=>row.content==='订阅规则30'));
});

test('oversized thinking history falls back as a whole instead of storing unbounded mobile data',()=>{const block=[{role:'assistant',reasoning_content:'x'.repeat(120001),content:'ok'}];assert.equal(savedAPIMessageBlock(block),undefined);const small=[{role:'assistant',reasoning_content:'查真实记录',content:'ok'}];assert.deepEqual(savedAPIMessageBlock(small),small);assert.notEqual(savedAPIMessageBlock(small),small);});
