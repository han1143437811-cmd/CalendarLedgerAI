import test from 'node:test';
import assert from 'node:assert/strict';
import {compressConversation,parseSummaryReply,normalizeSummary,summaryStatus,summaryCandidates} from '../ai-summary.mjs';
import {completionOptions} from '../ai-options.mjs';
import {withDeviceTime,deviceTime} from '../ai-time.mjs';
import {createInitialState} from '../core.mjs';
import {createChatBranch,switchChatBranch,initializeChatBranches} from '../chat-branches.mjs';
import {createPreviewServer} from '../server.mjs';

const history=(count,start=0)=>Array.from({length:count},(_,i)=>({id:'m'+(i+start),role:i%2?'assistant':'user',text:i%2?'助手说已完成，需核对工具结果。':'月订阅30元保留付款，日历按天分摊。'}));
const state=()=>({...createInitialState('2026-10-16',false),chat:history(32)});
const reply=(content,finishReason='stop')=>({message:{role:'assistant',content},finishReason});
const valid=()=>reply('{"summary":"用户希望保留实际付款，在日历按天显示分摊，操作状态待查询。"}');
const options={model:'deepseek-v4.1',baseURL:'https://api.deepseek.com',now:1000000};
const addHistory=s=>s.chat.push(...history(26,s.chat.length));

test('fenced JSON and small harmless preamble do not cause false summary failures',()=>{
  for(const text of ['```json\n{"summary":"明确偏好"}\n```','摘要如下：\n{"summary":"明确偏好"}\n'])assert.equal(parseSummaryReply(reply(text)),'明确偏好');
});
test('empty JSON output retries exactly once in compatible mode and preserves model and raw records',async()=>{
  const s=state(),before=JSON.stringify(s.chat),seen=[];
  const result=await compressConversation(s,{...options,request:async body=>{seen.push(body);return seen.length===1?reply(''):reply('用户希望保留原付款，并按天分摊月订阅费用，执行情况需要查询。');}});
  assert.equal(result.source,'api');assert.equal(seen.length,2);assert.deepEqual(seen.map(row=>row.summaryMode),['json','compatible']);assert.equal(s.aiSummary.model,options.model);assert.equal(s.aiSummary.wireMode,'compatible');assert.equal(JSON.stringify(s.chat),before);assert.equal(s.transactions.length,0);
});
test('successful compatible mode is remembered only for the same endpoint and model',async()=>{
  const s=state();await compressConversation(s,{...options,request:async body=>body.summaryMode==='json'?reply(''):valid()});addHistory(s);
  let mode;await compressConversation(s,{...options,request:async body=>{mode=body.summaryMode;return valid();}});assert.equal(mode,'compatible');
  addHistory(s);await compressConversation(s,{...options,model:'other-model',request:async body=>{mode=body.summaryMode;return valid();}});assert.equal(mode,'json');
  addHistory(s);await compressConversation(s,{...options,model:'other-model',baseURL:'https://example.org',request:async body=>{mode=body.summaryMode;return valid();}});assert.equal(mode,'json');
});
test('truncated output is never repaired into memory; one bounded retry gets a larger output budget',async()=>{
  const s=state(),seen=[];
  await compressConversation(s,{...options,request:async body=>{seen.push(body);return seen.length===1?reply('{"summary":"半截', 'length'):valid();}});
  assert.deepEqual(seen.map(row=>row.summaryMaxTokens),[4096,8192]);assert.equal(s.aiSummary.source,'api');assert.doesNotMatch(s.aiSummary.text,/半截/);
  assert.throws(()=>parseSummaryReply(reply('{"summary":"看似完整"}','length')),/长度上限/);
});
test('unsupported JSON or thinking parameters use the option-free compatible request',async()=>{
  for(const parameter of ['response_format','thinking','reasoning_effort']){
    const s=state();let calls=0;
    await compressConversation(s,{...options,request:async body=>{calls++;if(calls===1)throw Object.assign(new Error(parameter+' unsupported'),{upstreamStatus:400});assert.deepEqual(completionOptions(options.baseURL,'max',{summary:true,...body}),{max_tokens:4096});return valid();}});
    assert.equal(calls,2);assert.equal(s.aiSummary.source,'api');
  }
});
test('context-limit retry reduces the actual prefix and advances only through the supplied messages',async()=>{
  const s=state();s.chat=history(100).map(row=>({...row,text:'大段原文'.repeat(2000)}));let calls=0,first,last;
  await compressConversation(s,{...options,force:true,request:async body=>{const data=JSON.parse(body.messages[1].content);calls++;if(calls===1){first=data;throw Object.assign(new Error('context length exceeded'),{upstreamStatus:400});}last=data;return valid();}});
  assert.ok(JSON.stringify(last).length<JSON.stringify(first).length);assert.ok(JSON.stringify(last).length<11000);assert.equal(s.aiSummary.throughId,'m'+(last.excerpts.length-1));assert.ok(summaryCandidates(s).length>0);
});
test('an oversized first turn still makes progress and retains both ends as labeled excerpts',async()=>{
  const s=state();s.chat[0].text='开头金额30元'+ '长文'.repeat(40000)+'结尾付款ID tx_987';let sent;
  await compressConversation(s,{...options,request:async body=>{sent=JSON.parse(body.messages[1].content);return valid();}});
  assert.match(sent.excerpts[0].text,/开头金额30元/);assert.match(sent.excerpts[0].text,/tx_987/);assert.match(sent.excerpts[0].text,/摘略/);assert.equal(s.aiSummary.throughId,'m25');assert.equal(s.chat[0].text.length,80020);
});
test('reasoning-only replies never become summaries and both failures lead to labeled local excerpts',async()=>{
  const s=state(),before=JSON.stringify(s.chat);let calls=0;
  const result=await compressConversation(s,{...options,request:async()=>{calls++;return {message:{content:null,reasoning_content:'SECRET INTERNAL THOUGHT'}};}});
  assert.equal(calls,2);assert.equal(result.source,'local');assert.equal(s.aiSummary.lastFailure.code,'empty');assert.doesNotMatch(s.aiSummary.text,/SECRET INTERNAL/);assert.match(s.aiSummary.text,/非执行证据/);assert.equal(JSON.stringify(s.chat),before);
});
test('auth, missing model, rate limits, server errors and network failures do not cause immediate retry',async()=>{
  for(const status of [401,403,404,429,500,503,0]){
    const s=state();let calls=0;
    const result=await compressConversation(s,{...options,request:async()=>{calls++;throw Object.assign(new Error(status?'API 错误 '+status:'Failed to fetch'),{upstreamStatus:status});}});
    assert.equal(calls,1);assert.equal(result.source,'local');assert.equal(s.aiSummary.lastFailure.retryAt,options.now+600000);
  }
});
test('backoff survives cold normalization; no remote calls occur during cooldown',async()=>{
  let s=state();await compressConversation(s,{...options,request:async()=>{throw new Error('network offline');}});
  s=JSON.parse(JSON.stringify(s));s.aiSummary=normalizeSummary(s.aiSummary);addHistory(s);let calls=0;
  const result=await compressConversation(s,{...options,now:options.now+1000,request:async()=>{calls++;return valid();}});
  assert.equal(calls,0);assert.equal(result.cooldown,true);assert.equal(s.aiSummary.throughId,'m51');assert.equal(s.aiSummary.lastFailure.count,1);assert.match(summaryStatus(s.aiSummary,options.now+1000),/10 分钟/);
});
test('repeated failures have bounded exponential backoff and manual success clears it',async()=>{
  const s=state();let now=options.now;
  for(const minutes of [10,20,40,60,60]){
    if(s.aiSummary)addHistory(s);
    await compressConversation(s,{...options,now,request:async()=>{throw new Error('offline');}});
    assert.equal(s.aiSummary.lastFailure.retryAt-now,minutes*60000);now=s.aiSummary.lastFailure.retryAt+1;
  }
  const cursor=s.aiSummary.throughId,count=s.aiSummary.coveredMessages;
  const result=await compressConversation(s,{...options,now:now-1,force:true,request:valid});assert.equal(result.source,'api');assert.equal(s.aiSummary.lastFailure,undefined);assert.equal(s.aiSummary.throughId,cursor);assert.equal(s.aiSummary.coveredMessages,count);
});
test('manual API retry works immediately after local fallback with no new turns',async()=>{
  const s=state();await compressConversation(s,{...options,request:async()=>reply('')});const old=s.aiSummary;
  const result=await compressConversation(s,{...options,force:true,request:valid});assert.equal(result.attempts,1);assert.equal(result.source,'api');assert.equal(s.aiSummary.throughId,old.throughId);assert.equal(s.aiSummary.coveredMessages,old.coveredMessages);
});
test('changing a model bypasses only that connection cooldown without changing business data',async()=>{
  const s=state(),before=JSON.stringify(s.transactions);await compressConversation(s,{...options,request:async()=>{throw new Error('offline');}});addHistory(s);let calls=0;
  await compressConversation(s,{...options,model:'different',request:async()=>{calls++;return valid();}});assert.equal(calls,1);assert.equal(s.aiSummary.model,'different');assert.equal(JSON.stringify(s.transactions),before);
});
test('branch copies keep independent recovery metadata across serialization',async()=>{
  const s=state();initializeChatBranches(s);await compressConversation(s,{...options,request:async()=>reply('')});createChatBranch(s,{draft:''});const second=s.activeChatBranchId;switchChatBranch(s,s.chatBranches[0].id,'');
  assert.equal(s.aiSummary.source,'local');assert.ok(s.aiSummary.lastFailure.retryAt>options.now);switchChatBranch(s,second,'');assert.equal(s.aiSummary,null);
});
test('cancelled compaction never commits a partial summary or local fallback',async()=>{
  for(const fail of [false,true]){
    const s=state(),before=JSON.stringify(s),controller=new AbortController();
    await assert.rejects(compressConversation(s,{...options,signal:controller.signal,request:async()=>{controller.abort();if(fail)throw new Error('socket closed');return valid();}}),{name:'AbortError'});assert.equal(JSON.stringify(s),before);
  }
});
test('untrusted tools, malformed JSON, oversized summaries and secret-shaped text are never saved as API summaries',()=>{
  for(const value of [reply('{}'),reply('{"summary":"incomplete'),reply('{"summary":"'+ 'x'.repeat(3501)+'"}'),reply('{"summary":"sk-abcdefghijklmnopqrstuvwxyz"}'),{message:{content:'{"summary":"完成"}',tool_calls:[{}]}}])assert.throws(()=>parseSummaryReply(value,'compatible'));
});
test('raw local excerpts and failure explanations redact credential-shaped text',async()=>{
  const s=state();s.chat[0].text='我误贴 sk-abcdefghijklmnopqrstuvwxyz，请勿记住。';
  await compressConversation(s,{...options,request:async()=>{throw new Error('API 错误 401 Bearer sk-abcdefghijklmnopqrstuvwxyz');}});
  assert.doesNotMatch(JSON.stringify(s.aiSummary),/sk-abcdefghijklmnopqrstuvwxyz/);assert.match(s.aiSummary.text,/密钥已隐藏/);assert.match(s.chat[0].text,/sk-abcdefghijklmnopqrstuvwxyz/);
});
test('summary clock is passive metadata while normal chat retains current-time instructions',()=>{
  const c=deviceTime({now:new Date('2026-10-16T10:00:00Z'),timeZone:'Asia/Singapore'}),messages=[{role:'system',content:'compress'},{role:'user',content:'旧资料'}];
  const summary=withDeviceTime(messages,c,c,{purpose:'summary'});assert.match(summary[1].content,/只压缩历史资料/);assert.doesNotMatch(summary[1].content,/回答“现在几点”/);assert.match(withDeviceTime(messages,c)[1].content,/回答“现在几点”/);assert.deepEqual(summary.at(-1),messages.at(-1));
});
test('summary option allowlist is independent from normal response budgets and tools',()=>{
  assert.deepEqual(completionOptions(options.baseURL,'max',{summary:true,summaryMode:'compatible',summaryMaxTokens:8192}),{max_tokens:8192});
  assert.throws(()=>completionOptions(options.baseURL,'none',{summary:true,summaryMode:'arbitrary'}));assert.throws(()=>completionOptions(options.baseURL,'none',{summary:true,summaryMaxTokens:999999}));assert.equal(completionOptions(options.baseURL,'high').reasoning_effort,'high');
});
test('actual preview proxy forwards compatible summary fields and masks upstream errors with status',async()=>{
  const seen=[],key='fixture-secret-without-standard-prefix';let reject=false;
  const server=createPreviewServer({upstreamFetch:async(url,init)=>{seen.push(JSON.parse(init.body));return new Response(JSON.stringify(reject?{error:{message:'response_format unsupported '+key}}:{choices:[{message:{content:'{"summary":"真实代理"}'},finish_reason:'stop'}]}),{status:reject?422:200,headers:{'Content-Type':'application/json'}});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const post=async body=>{const r=await fetch('http://127.0.0.1:'+server.address().port+body.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body.value)});return r.json();};
  try{
    await post({path:'/api/config',value:{provider:'deepseek',baseURL:options.baseURL,model:options.model,apiKey:key}});
    const body={purpose:'summary',messages:[{role:'user',content:'摘要'}],summaryMode:'compatible',summaryMaxTokens:8192,effort:'none',tools:[{}]};await post({path:'/api/chat',value:body});
    assert.equal(seen[0].model,options.model);assert.equal(seen[0].max_tokens,8192);assert.equal(seen[0].response_format,undefined);assert.equal(seen[0].thinking,undefined);assert.equal(seen[0].tools,undefined);
    reject=true;const data=await post({path:'/api/chat',value:body});assert.equal(data.upstreamStatus,422);assert.match(data.error,/response_format/);assert.doesNotMatch(data.error,new RegExp(key));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
