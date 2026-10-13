import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeAPIBase,apiEndpoint,thinkingEnabled} from '../api-providers.mjs';import {completionOptions} from '../ai-options.mjs';import {createPreviewServer} from '../server.mjs';
test('gateway roots, v1 prefixes and complete endpoints normalize once with correct model paths',()=>{
  for(const value of ['https://gateway.example','https://gateway.example/','https://gateway.example/v1/','https://gateway.example/v1/chat/completions'])assert.equal(normalizeAPIBase(value,'newapi'),'https://gateway.example/v1');
  assert.equal(apiEndpoint('https://gateway.example/tenant/api/v1/chat/completions','models'),'https://gateway.example/tenant/api/v1/models');assert.equal(apiEndpoint('https://api.deepseek.com'),'https://api.deepseek.com/chat/completions');assert.equal(apiEndpoint('https://openrouter.ai/api/v1'),'https://openrouter.ai/api/v1/chat/completions');
  for(const value of ['https://user:pass@gateway.example/v1','https://gateway.example/v1?key=a','https://gateway.example/v1#key','http://gateway.example/v1'])assert.throws(()=>normalizeAPIBase(value,'newapi'));
});
test('gateway thinking requires explicit format selection and summary remains no-thinking',()=>{
  assert.equal(thinkingEnabled({baseURL:'https://gateway.example/v1'}),false);assert.equal(thinkingEnabled({baseURL:'https://gateway.example/v1',thinkingFormat:'deepseek'}),true);
  assert.equal(completionOptions('https://gateway.example/v1','max').thinking,undefined);const options=completionOptions('https://gateway.example/v1','max',{thinkingFormat:'deepseek'});assert.equal(options.reasoning_effort,'max');assert.equal(options.thinking.type,'enabled');
  assert.equal(completionOptions('https://gateway.example/v1','max',{thinkingFormat:'deepseek',summary:true}).thinking.type,'disabled');assert.equal(completionOptions('https://api.deepseek.com','max',{thinkingFormat:'none'}).thinking,undefined);
});
async function fixture(run){const calls=[];const server=createPreviewServer({upstreamFetch:async(url,options)=>{calls.push({url,...options});return new Response(JSON.stringify(url.endsWith('/models')?{data:[{id:'tenant-model'}]}:{model:'tenant-model',choices:[{message:{role:'assistant',content:'OK'}}]}),{headers:{'Content-Type':'application/json'}});}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});try{await run({calls,post,get:()=>fetch(base+'/api/config').then(r=>r.json())});}finally{await new Promise(r=>server.close(r));}}
test('saved keys are service-bound, switch back works, and missing new key never reuses old credentials',async()=>fixture(async({calls,post,get})=>{
  await post('/api/config',{baseURL:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'fixture-key-a'});
  assert.equal((await post('/api/config',{provider:'newapi',baseURL:'https://gateway.example',model:'tenant-model'})).status,400);assert.equal((await get()).baseURL,'https://api.deepseek.com');
  const r=await(await post('/api/config',{provider:'newapi',baseURL:'https://gateway.example',model:'tenant-model',apiKey:'fixture-key-b'})).json();assert.equal(r.profiles.length,2);assert.equal(JSON.stringify(r).includes('fixture-key'),false);
  await post('/api/chat',{messages:[{role:'user',content:'测试'}]});assert.equal(calls.at(-1).headers.Authorization,'Bearer fixture-key-b');assert.equal(calls.at(-1).url,'https://gateway.example/v1/chat/completions');
  await post('/api/config',{provider:'deepseek',baseURL:'https://api.deepseek.com',model:'deepseek-flash'});await post('/api/chat',{messages:[{role:'user',content:'测试'}]});assert.equal(calls.at(-1).headers.Authorization,'Bearer fixture-key-a');
}));
test('model-list probe uses selected gateway credentials without changing active model or provider',async()=>fixture(async({calls,post,get})=>{
  await post('/api/config',{baseURL:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'fixture-key-a'});const before=await get();
  const list=await(await post('/api/models',{provider:'newapi',baseURL:'https://gateway.example/tenant/v1/chat/completions',apiKey:'fixture-probe'})).json();assert.deepEqual(list.items,['tenant-model']);assert.equal(calls.at(-1).url,'https://gateway.example/tenant/v1/models');assert.equal(calls.at(-1).headers.Authorization,'Bearer fixture-probe');assert.deepEqual(await get(),before);
}));
test('proxy selected model, tool schema and explicit thinking format reach gateway unchanged',async()=>fixture(async({calls,post})=>{
  await post('/api/config',{provider:'newapi',baseURL:'https://gateway.example/v1',model:'renamed-deepseek-model',apiKey:'fixture-key-b',thinkingFormat:'deepseek'});const tools=[{type:'function',function:{name:'query_cashflow',parameters:{type:'object',properties:{}}}}];await post('/api/chat',{messages:[{role:'user',content:'分析'}],tools,effort:'high'});const body=JSON.parse(calls.at(-1).body);assert.equal(body.model,'renamed-deepseek-model');assert.deepEqual(body.tools,tools);assert.equal(body.reasoning_effort,'high');assert.equal(body.thinking.type,'enabled');
}));
test('connection count and invalid configurations are bounded and atomic',async()=>fixture(async({post,get})=>{
  for(let i=0;i<8;i++)assert.equal((await post('/api/config',{provider:'newapi',baseURL:'https://gateway'+i+'.example/v1',model:'m',apiKey:'fixture-key-'+i})).status,200);
  const before=await get();assert.equal((await post('/api/config',{provider:'newapi',baseURL:'https://gateway9.example/v1',model:'m',apiKey:'fixture-key-9'})).status,400);assert.deepEqual(await get(),before);
}));
