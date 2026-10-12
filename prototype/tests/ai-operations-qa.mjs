// Headless checks for the app being developed. Uses a disposable browser profile.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState,STORAGE_KEY} from '../core.mjs';
import {createPreviewServer} from '../server.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),output=path.join(root,'qa');
await mkdir(output,{recursive:true});
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${path.join(output,'browser-profile-ai-operations')}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--window-size=1440,1000','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws,apiServer,firstMockServer,previewServer;const findings=[],errors=[],expectedNetworkErrors=[];let expectProviderFailure=false;
async function holidayFixture(url){const match=url.match(/\/(\d{4})\.json/);return new Response(await readFile(path.join(root,'holidays',`${match[1]}.json`),'utf8'),{status:200,headers:{'Content-Type':'application/json'}});}
try{
  const browserURL=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(new Error('Headless Chrome did not start in 30s')),30000);browser.stderr.on('data',data=>{text+=data;const match=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});browser.on('error',reject);browser.on('exit',code=>{clearTimeout(timeout);reject(new Error(`Chrome exited (${code}): ${text.slice(-2000)}`));});});
  const origin=browserURL.replace(/^ws:/,'http:').split('/devtools/')[0];const targets=await(await fetch(`${origin}/json/list`)).json();const target=targets.find(t=>t.type==='page');if(!target)throw new Error('No page target');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});let counter=0;const pending=new Map();
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text);else if(message.method==='Log.entryAdded'&&message.params.entry.level==='error'){const entry=message.params.entry;if(expectProviderFailure&&entry.text.includes('400')&&entry.url?.includes('/api/chat'))expectedNetworkErrors.push(entry.text);else errors.push(entry.text+' '+(entry.url??''));}});
  function command(method,params={}){return new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Timed out: ${method}`));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
  async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Condition not reached: ${expression}`);}
  async function click(selector){await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing element: '+${JSON.stringify(selector)});e.click();})()`);}
  async function fill(selector,value){await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing field');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
  async function screenshot(filename){await waitFor('[...document.images].every(i=>i.complete&&i.naturalWidth>0)');await waitFor('!document.querySelector("#toast").classList.contains("show")');const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,filename),Buffer.from(image.data,'base64'));}
  async function checkLayout(label){const result=await evaluate(`({width:innerWidth,doc:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0).length})`);assert.ok(result.doc<=result.width+1,`${label}: horizontal overflow ${result.doc}/${result.width}`);findings.push({check:label,...result});}

  await command('Page.enable');await command('Runtime.enable');await command('Log.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:850,deviceScaleFactor:1,mobile:true});
  const requests=[];let steps=[],step=0;
  const toolCall=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'qa-'+requests.length,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
  previewServer=createPreviewServer({upstreamFetch:async(url,options)=>{
    if(url.includes('/holiday-cn'))return holidayFixture(url);if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'deepseek-flash'},{id:'deepseek-v4-pro'}]}),{headers:{'Content-Type':'application/json'}});
    const payload=JSON.parse(options.body);requests.push(payload);
    const message=typeof steps[step]==='function'?steps[step++](payload):steps[step++];
    assert.ok(message,'Unexpected upstream call');
    return new Response(JSON.stringify({model:'mock-tools-provider',choices:[{message}]}),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  await new Promise(resolve=>previewServer.listen(0,'127.0.0.1',resolve));
  await command('Page.navigate',{url:`http://127.0.0.1:${previewServer.address().port}`});await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)},${JSON.stringify(JSON.stringify(createInitialState('2026-10-13',false)))});location.reload()`);await waitFor('!!globalThis.calendarLedgerPreview&&calendarLedgerPreview.getState().dataMode==="personal"');
  await click('[data-action=settings]');await fill('select[name=aiMode]','deepseek');await fill('input[name=apiKey]','mock-no-real-key');await evaluate('document.querySelector("form[data-form=settings]").requestSubmit()');await waitFor('!document.querySelector(".modal")');
  async function send(prompt,sequence){steps=sequence;step=0;await evaluate(`calendarLedgerPreview.sendChat(${JSON.stringify(prompt)})`);await waitFor('!document.querySelector("#chat-form button[type=submit]").disabled');assert.equal(step,sequence.length);}
  const final=text=>({role:'assistant',content:text});
  const check=(name,value)=>{assert.ok(value,name);findings.push({check:name,passed:true});};
  await send('2026-10-01 记 API月订阅30元',[toolCall('create_transactions',{items:[{note:'API月订阅',amount:30,date:'2026-10-01',category:'娱乐'}]}),final('已登记付款。')]);
  const sourceId=await evaluate('calendarLedgerPreview.getState().transactions[0].id');
  await send('把刚才月订阅的钱均摊到每一天',[
    toolCall('search_transactions',{query:'API月订阅'}),
    payload=>{const result=JSON.parse(payload.messages.filter(row=>row.role==='tool').at(-1).content);check('allocation receives the actual queried source ID',result.items[0].id===sourceId);return toolCall('allocate_expense',{transactionIds:[result.items[0].id]});},
    toolCall('query_daily_costs',{start:'2026-10-01',end:'2026-10-31'}),
    payload=>{const result=JSON.parse(payload.messages.filter(row=>row.role==='tool').at(-1).content);check('API sees locally verified conserved total and 31 daily costs',result.expense===3000&&result.allocationCount===31);return final('已按31天分摊，保留付款30元。');}
  ]);
  check('real application uses one payment plus one allocation',(await evaluate('calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().expenseAllocations.length===1')));
  await send('记住，我的月订阅默认保留付款按天分摊',[toolCall('remember_preference',{key:'订阅分摊规则',value:'保留实际付款，按天分摊'}),final('已记住。')]);
  await evaluate('location.reload()');await waitFor('!!globalThis.calendarLedgerPreview&&calendarLedgerPreview.getConfig().configured');
  check('page reload keeps memory and saved conversation',await evaluate('calendarLedgerPreview.getState().aiMemory.length===1&&calendarLedgerPreview.getState().chat.length===6'));
  const requestStart=requests.length;
  await send('把刚才那笔改成62',[
    toolCall('search_transactions',{query:'API月订阅'}),toolCall('update_transaction',{id:sourceId,amount:62}),toolCall('query_daily_costs',{start:'2026-10-01',end:'2026-10-31'}),
    payload=>{const result=JSON.parse(payload.messages.filter(row=>row.role==='tool').at(-1).content);check('follow-up API query sees updated daily cost',result.expense===6200);return final('已更新原付款，分摊随之更新。');}
  ]);
  const wire=JSON.stringify(requests[requestStart].messages);
  check('cold API request carries previous dialogue, preference and exact ID',wire.includes('保留实际付款，按天分摊')&&wire.includes('记 API月订阅30元')&&wire.includes(sourceId));
  check('follow-up changes one source, not creating duplicated payments',await evaluate('calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().transactions[0].amount===6200'));
  await click('.mobile-nav [data-page=more]');await click('.main [data-action=ai-memory]');
  check('mobile memory panel fits screen',await evaluate('document.querySelector(".modal").getBoundingClientRect().right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth+1'));
  check('memory input uses the app styling and touch target',await evaluate('document.querySelector("[data-memory-form] input").getBoundingClientRect().height>=44&&parseFloat(getComputedStyle(document.querySelector("[data-memory-form] input")).borderRadius)>0'));
  await screenshot('mobile-ai-memory-v0.3.5.png');
  await fill('[data-memory-form] input[name=key]','默认账户');await fill('[data-memory-form] input[name=value]','银行卡');await evaluate('document.querySelector("[data-memory-form]").requestSubmit()');
  check('memory settings adds preferences through the real dispatcher',await evaluate('calendarLedgerPreview.getState().aiMemory.some(row=>row.key==="默认账户"&&row.value==="银行卡")'));
  await click('[data-memory-delete="0"]');check('forget memory preserves payment and allocation',await evaluate('calendarLedgerPreview.getState().aiMemory.length===1&&calendarLedgerPreview.getState().transactions.length===1&&calendarLedgerPreview.getState().expenseAllocations.length===1'));
  await click('[data-action=close-modal]');await click('.mobile-nav [data-page=calendar]');
  check('calendar clearly labels allocation and shows two-yuan daily share',await evaluate('document.querySelector(".calendar-foot").textContent.includes("费用按天分摊")&&document.querySelector(".calendar-day[data-date=\\"2026-10-13\\"] .day-money").textContent.includes("2")'));
  await screenshot('mobile-allocation-v0.3.5.png');
  check('all API rounds advertise local memory and allocation tools',requests.every(payload=>payload.tools.some(row=>row.function.name==='allocate_expense')&&payload.tools.some(row=>row.function.name==='remember_preference')));
  check('API wire histories contain paired call/result IDs',requests.every(payload=>payload.messages.every((row,index)=>!row.tool_calls||row.tool_calls.every(call=>payload.messages.slice(index+1).some(message=>message.role==='tool'&&message.tool_call_id===call.id)))));
  await send('我习惯用支付宝支付',[toolCall('propose_preference',{key:'默认账户',value:'支付宝',evidence:'我习惯用支付宝支付'}),final('提交了一个待核对偏好，请在记忆页面采纳。')]);
  check('API suggestion uses exact user quote and remains inactive',await evaluate('calendarLedgerPreview.getState().aiMemorySuggestions[0].evidence==="我习惯用支付宝支付"&&calendarLedgerPreview.getState().aiMemory.length===1'));
  await click('.mobile-nav [data-page=more]');await click('.main [data-action=ai-memory]');
  check('suggestion buttons meet phone touch size without overflow',await evaluate('document.querySelector("[data-memory-accept]").getBoundingClientRect().height>=44&&document.documentElement.scrollWidth<=innerWidth+1'));
  await screenshot('mobile-memory-suggestion-v0.3.5.png');
  await click('[data-memory-accept]');
  check('accept replaces same-key memory and preserves source',await evaluate('calendarLedgerPreview.getState().aiMemory.length===1&&calendarLedgerPreview.getState().aiMemory[0].evidence==="我习惯用支付宝支付"&&calendarLedgerPreview.getState().aiMemorySuggestions.length===0'));
  await click('[data-action=close-modal]');await evaluate('location.reload()');await waitFor('!!globalThis.calendarLedgerPreview');
  check('accepted preference survives cold reload',await evaluate('calendarLedgerPreview.getState().aiMemory[0].evidence==="我习惯用支付宝支付"'));
  await send('查询我的默认账户',[toolCall('search_ai_memory',{query:'默认账户'}),payload=>{const result=JSON.parse(payload.messages.filter(row=>row.role==='tool').at(-1).content);check('model sees recalled confirmed preference',result.items[0].value==='支付宝');return final('已确认的默认账户偏好是支付宝。');}]);
  await click('.mobile-nav [data-page=more]');await click('.main [data-action=ai-memory]');await click('[data-memory-suggestions-toggle]');
  check('phone setting disables suggestions',await evaluate('calendarLedgerPreview.getState().aiMemoryPolicy.suggestions===false'));
  await click('[data-action=close-modal]');
  await send('我习惯晚上安排运动',[toolCall('propose_preference',{key:'运动时间',value:'晚上',evidence:'我习惯晚上安排运动'}),final('偏好建议已关闭，没有保存。')]);
  check('disabled policy blocks provider memory writes',await evaluate('calendarLedgerPreview.getState().aiMemorySuggestions.length===0&&calendarLedgerPreview.getState().aiMemory.length===1'));
  await evaluate(`(() => {const snapshot=calendarLedgerPreview.getState();snapshot.aiChatArchive.push({role:"user",text:"健身年费明年三月到期",results:[]});localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify(snapshot));location.reload();})()`);await waitFor('!!globalThis.calendarLedgerPreview');
  await send('查一下之前健身年费什么时候到期',[payload=>{check('older chat excerpt is automatically recalled',payload.messages[0].content.includes('健身年费明年三月到期'));return toolCall('search_chat_history',{query:'健身 到期'});},payload=>{const result=JSON.parse(payload.messages.filter(row=>row.role==='tool').at(-1).content);check('history tool searches archived original text',result.items.some(row=>row.archived===true&&row.text==='健身年费明年三月到期'));return final('旧聊天原话提到明年三月到期，需要核实当前订阅记录。');}]);
  await click('#chat-model-button');await click('[data-fetch-models]');await waitFor('document.querySelectorAll("[data-model-list] button").length===2');
  check('model selector retrieves official endpoint model IDs',await evaluate('document.querySelector("[data-model-list]").textContent.includes("deepseek-v4-pro")'));
  await click('[data-model-choice="deepseek-v4-pro"]');await fill('[data-ai-controls] input[name=effort]','3');await evaluate('document.querySelector("[data-ai-controls]").requestSubmit()');await waitFor('calendarLedgerPreview.getConfig().model==="deepseek-v4-pro"');
  check('model and real max-effort slider persist',await evaluate('calendarLedgerPreview.getConfig().effort==="max"&&document.querySelector("#chat-model-button").textContent.includes("V4 Pro")'));
  check('control sheet fits narrow phone',await evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector(".ai-thinking-control input").getBoundingClientRect().height>=44'));
  await screenshot('mobile-model-controls-v0.3.5.png');await click('[data-action=close-modal]');
  await send('读取已确认偏好',[{...toolCall('get_ai_memory',{}),reasoning_content:'需要读取真实偏好。'},payload=>{check('max effort reaches upstream wire with complete thinking tool round',payload.model==='deepseek-v4-pro'&&payload.reasoning_effort==='max'&&payload.thinking.type==='enabled'&&payload.messages.some(row=>row.reasoning_content==='需要读取真实偏好。'));return {...final('当前默认账户是支付宝。'),reasoning_content:'本地查询确认。'};}]);
  steps=[payload=>{check('manual summary calls selected model without tools or thinking',payload.model==='deepseek-v4-pro'&&payload.thinking.type==='disabled'&&payload.reasoning_effort==='none'&&!payload.tools&&payload.response_format.type==='json_object'&&payload.max_tokens===1600);return final(JSON.stringify({summary:'用户月订阅付款已修改为62元，按天分摊；默认账户已确认支付宝。需要核实当前账目时重新查询。'}));}];step=0;
  await click('[data-action=compress-chat]');await waitFor('!!calendarLedgerPreview.getState().aiSummary&&!document.querySelector("#chat-form button[type=submit]").disabled');
  check('manual API compaction preserves original chat and payment',step===1&&(await evaluate('calendarLedgerPreview.getState().chat.length>6&&calendarLedgerPreview.getState().transactions[0].amount===6200')));
  await evaluate('location.reload()');await waitFor('!!globalThis.calendarLedgerPreview&&calendarLedgerPreview.getConfig().configured');
  check('model effort and summary survive app-like reload',await evaluate('calendarLedgerPreview.getConfig().effort==="max"&&calendarLedgerPreview.getConfig().model==="deepseek-v4-pro"&&calendarLedgerPreview.getState().aiSummary.text.includes("62元")'));
  await send('接着分析订阅',[payload=>{check('next tool conversation receives durable summary and complete recent thinking messages',payload.messages[0].content.includes('用户月订阅付款已修改为62元')&&payload.messages.some(row=>row.reasoning_content==='本地查询确认。'));return {...toolCall('query_daily_costs',{start:'2026-10-01',end:'2026-10-31'}),reasoning_content:'重新查询当前分摊口径。'};},{...final('按查询结果，月费用62元。'),reasoning_content:'以当前本地结果为准。'}]);
  await click('.mobile-nav [data-page=more]');await click('.main [data-action=ai-memory]');await evaluate('window.confirm=()=>true');await click('[data-memory-clear-chat]');
  check('clear context removes archive and messages but keeps confirmed preference and money',await evaluate('calendarLedgerPreview.getState().aiSummary===null&&calendarLedgerPreview.getState().aiChatArchive.length===0&&calendarLedgerPreview.getState().chat.length===0&&calendarLedgerPreview.getState().aiMemory.length===1&&calendarLedgerPreview.getState().transactions.length===1'));
  check('API key is absent from local memory and ledger snapshot',!(await evaluate('JSON.stringify(localStorage)')).includes('mock-no-real-key'));
  assert.equal(errors.length,0,errors.join('\n'));
  const report={passed:true,version:'0.3.5',actualProvider:false,apiKeyUsed:false,requests:requests.length,findings,errors};
  await writeFile(path.join(output,'ai-operations-results-v0.3.5.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await writeFile(path.join(output,'ai-operations-results-v0.3.5.json'),JSON.stringify({passed:false,error:error.message,findings,errors},null,2));console.error(error.stack);process.exitCode=1;}
finally{if(previewServer?.listening)await new Promise(resolve=>previewServer.close(resolve));if(ws)ws.close();browser.kill();}
