import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatStream} from '../chat-stream.mjs';
import {renderMarkdown} from '../chat-markdown.mjs';
import {runToolConversation} from '../ai-agent.mjs';
import {buildConversationContext} from '../ai-context.mjs';
import {createInitialState,TOOLS,dispatch} from '../core.mjs';
import {completionOptions} from '../ai-options.mjs';
import {createPreviewServer} from '../server.mjs';
const event=(delta,finish_reason=null)=>'data: '+JSON.stringify({model:'test-model',choices:[{index:0,delta,finish_reason}]})+'\r\n\r\n';
test('SSE joins arbitrarily split Chinese content, reasoning and tool argument fragments',()=>{
  const updates=[],stream=createChatStream(part=>updates.push(part));
  const wire=event({reasoning_content:'分析问题。'})+event({content:'你好，'})+event({content:'我们慢慢聊。'})+event({tool_calls:[{index:0,id:'call1',function:{name:'query_cashflow',arguments:'{"start":'}}]})+event({tool_calls:[{index:0,function:{arguments:'"2026-10-01"}'}}]},'tool_calls')+'data: [DONE]\n\n';
  for(let i=0;i<wire.length;i+=7)stream.feed(wire.slice(i,i+7));
  const result=stream.result();assert.equal(result.message.content,'你好，我们慢慢聊。');assert.equal(result.message.reasoning_content,'分析问题。');assert.deepEqual(JSON.parse(result.message.tool_calls[0].function.arguments),{start:'2026-10-01'});assert.ok(updates.length>2);
});
test('unfinished streams and truncated tool calls cannot be executed',()=>{
  const interrupted=createChatStream();interrupted.feed(event({content:'已收到的文字'}));assert.throws(()=>interrupted.result(),/提前结束/);
  const truncated=createChatStream();truncated.feed(event({tool_calls:[{index:0,id:'x',function:{name:'create_transactions',arguments:'{'}}]},'length'));assert.throws(()=>truncated.result(),/没有完整结束/);
  const errored=createChatStream();assert.throws(()=>errored.feed('data: {"error":{"message":"private secret"}}\n\n'),e=>!e.message.includes('private secret'));
});
test('length-limited plain answer preserves text and explicit finish reason',()=>{const stream=createChatStream();stream.feed(event({content:'长文的前半部分'},'length'));assert.equal(stream.result().finishReason,'length');});
test('Markdown renders prose, tables and code while refusing active HTML and unsafe links',()=>{
  const html=renderMarkdown('# 分析\n\n**原因**\n\n- 第一项\n- 第二项\n\n| 项目 | 数值 |\n| --- | --- |\n| A | 30 |\n\n```js\n<script>alert(1)</script>\n```\n<script>alert(2)</script>\n[bad](javascript:alert(3))\n![image](https://example.com/private.png)');
  assert.match(html,/<h1>分析/);assert.match(html,/<strong>原因/);assert.match(html,/<table>/);assert.match(html,/<pre><code/);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('<img'));
  assert.match(renderMarkdown('[source](https://example.com/a?q=1&b=2)'),/rel="noopener noreferrer"/);
});
test('general conversation returns a long answer without any tools or local mutations',async()=>{
  const state=createInitialState('2026-10-13',false),before=JSON.stringify(state),text='详细解释及其原因。'.repeat(800);
  const messages=buildConversationContext(state,{prompt:'深入聊聊怎样学习编程，不需要改日历',today:'2026-10-13',timeZone:'Asia/Singapore'});
  assert.match(messages[0].content,/可以讨论日历账本以外/);
  const reply=await runToolConversation({messages,tools:TOOLS,request:async()=>({message:{role:'assistant',content:text}}),execute:()=>assert.fail('ordinary chat must not mutate data'),isReadOnly:()=>false,describe:()=>''});
  assert.equal(reply.text,text);assert.deepEqual(reply.results,[]);assert.equal(JSON.stringify(state),before);
});
test('long previous replies retain reasoning conclusions past the old 1800-character cut',()=>{
  const state=createInitialState('2026-10-13',false);state.chat=[{role:'user',text:'比较两种方案'},{role:'assistant',text:'说明'.repeat(3000)+'最终建议是方案乙'}];
  const wire=buildConversationContext(state,{prompt:'为什么选乙',today:'2026-10-13',timeZone:'Asia/Singapore'});assert.ok(wire.some(row=>row.content?.includes('最终建议是方案乙')));
});
test('cancel after a completed write retains it and prevents the next tool call',async()=>{
  const state=createInitialState('2026-10-13',false),controller=new AbortController();let executions=0;
  const tool={type:'function',function:{name:'write',parameters:{type:'object',properties:{}}}};
  await assert.rejects(runToolConversation({messages:[],tools:[tool],signal:controller.signal,isReadOnly:()=>false,describe:()=>'',request:async()=>({message:{role:'assistant',tool_calls:[1,2].map(n=>({id:'c'+n,function:{name:'write',arguments:'{}'}}))}}),execute:()=>{executions++;return {ok:true,operationId:'saved'};},onResult:()=>controller.abort()}),error=>{assert.equal(error.completedResults.length,1);return error.name==='AbortError';});assert.equal(executions,1);
});
test('tool budget exhaustion requests a readable final analysis with no further tools',async()=>{let count=0;const result=await runToolConversation({messages:[],tools:[{type:'function',function:{name:'query',parameters:{type:'object',properties:{}}}}],maxTurns:1,isReadOnly:()=>true,describe:()=>'',execute:()=>({ok:true,total:30}),request:async body=>{if(count++===0)return {message:{role:'assistant',tool_calls:[{id:'t1',function:{name:'query',arguments:'{}'}}]}};assert.deepEqual(body.tools,[]);return {message:{role:'assistant',content:'根据30元的实际结果，建议……'}};}});assert.match(result.text,/建议/);assert.equal(result.results.length,1);});
test('response budgets are configurable, bounded and independent from summary budgets',()=>{assert.equal(completionOptions('https://gateway.example','none').max_tokens,8192);assert.equal(completionOptions('https://gateway.example','none',{maxTokens:16384}).max_tokens,16384);assert.equal(completionOptions('https://api.deepseek.com','max',{maxTokens:8192}).max_tokens,32768);assert.throws(()=>completionOptions('https://gateway.example','none',{maxTokens:999999}));});
test('preview sends real SSE before completion and aborts upstream when client disconnects',async()=>{
  let wire,aborted=false;const server=createPreviewServer({upstreamFetch:async(url,options)=>{wire=JSON.parse(options.body);return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(event({content:'第一段'})));options.signal.addEventListener('abort',()=>{aborted=true;controller.close();});}}),{headers:{'Content-Type':'text/event-stream'}});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{await fetch(base+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseURL:'https://gateway.example',model:'test',apiKey:'test-fixture'})});const controller=new AbortController();const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'长文'}],stream:true,maxTokens:16384}),signal:controller.signal});const reader=response.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/第一段/);assert.equal(wire.stream,true);assert.equal(wire.max_tokens,16384);controller.abort();await new Promise(resolve=>setTimeout(resolve,80));assert.equal(aborted,true);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
