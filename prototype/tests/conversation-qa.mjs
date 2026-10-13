// Browser acceptance for persistent chat DOM, scroll trajectories and drafts.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createPreviewServer} from '../server.mjs';
import {STORAGE_KEY} from '../core.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),output=path.join(root,'qa');
const appVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
await mkdir(output,{recursive:true});
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${path.join(output,'browser-profile-conversation')}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws,server,trace,defaultReducedMotion;const findings=[],errors=[];
try{
  const browserURL=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Chrome did not start')),30000);browser.stderr.on('data',data=>{text+=data;const match=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});browser.on('error',reject);});
  const origin=browserURL.replace(/^ws:/,'http:').split('/devtools/')[0],targets=await(await fetch(`${origin}/json/list`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let counter=0;const pending=new Map();
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const request=pending.get(message.id);if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text);});
  function command(method,params={}){return new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>reject(new Error('Timed out: '+method)),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;}
  async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,60));}throw new Error('Condition not reached: '+expression);}
  async function check(name,expression){const value=await evaluate(expression);assert.equal(value,true,name);findings.push({check:name,passed:true});}
  async function send(text){await evaluate(`(() => {const input=document.querySelector('#chat-input');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-form').requestSubmit();})()`);}
  const idle='!document.querySelector("#chat-form button[type=submit]").disabled';
  const settled='document.querySelector("#chat-scroll").scrollHeight-document.querySelector("#chat-scroll").clientHeight-document.querySelector("#chat-scroll").scrollTop<2';
  await command('Page.enable');await command('Runtime.enable');
  defaultReducedMotion=await evaluate('matchMedia("(prefers-reduced-motion:reduce)").matches');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:850,deviceScaleFactor:1,mobile:true});
  let mode='long',lastWire,abortCount=0;
  const chunk=(content,reasoning,finish)=>'data: '+JSON.stringify({model:'analysis-model',choices:[{index:0,delta:{...(content?{content}:{}),...(reasoning?{reasoning_content:reasoning}:{})},finish_reason:finish??null}]})+'\n\n';
  server=createPreviewServer({upstreamFetch:async(url,options={})=>{
    if(url.includes('/holidays/')||/\/\d{4}\.json/.test(url)){const year=url.match(/\/(\d{4})\.json/)[1];return new Response(await readFile(path.join(root,'holidays',year+'.json'),'utf8'));}
    if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'analysis-model'},{id:'fast-model'}]}),{headers:{'Content-Type':'application/json'}});
    lastWire=JSON.parse(options.body);
    const pieces=['## 把复杂问题拆小\n\n','先明确目标，再比较方案和限制。我们可以从你最关心的问题开始。\n\n','### 一个可执行的学习路线\n\n','1. 每天保留一段完整的学习时间。\n2. 先做小项目，再补充知识。\n3. 用真实问题检验学习效果。\n\n','| 阶段 | 任务 | 时间 |\n| --- | --- | --- |\n| 第一步 | 选一个小项目 | 每天30分钟 |\n| 第二步 | 写出可运行版本 | 一周 |\n\n','```python\nprint("从一个小目标开始")\n```\n\n','最后，根据完成情况调整节奏，而不是不断增加任务。\n\n'];
    let cursor=0,closed=false;const count=mode==='stop'?100:37;
    return new Response(new ReadableStream({start(controller){
      const timer=setInterval(()=>{if(closed)return;try{if(cursor===0)controller.enqueue(new TextEncoder().encode(chunk(null,'先理解用户目标，再比较可执行的方案。')));else if(cursor<count)controller.enqueue(new TextEncoder().encode(chunk(pieces[(cursor-1)%pieces.length])));else{controller.enqueue(new TextEncoder().encode(chunk(null,null,'stop')+'data: [DONE]\n\n'));closed=true;clearInterval(timer);controller.close();}cursor++;}catch{closed=true;clearInterval(timer);}},90);
      options.signal.addEventListener('abort',()=>{abortCount++;clearInterval(timer);if(!closed){closed=true;controller.close();}});
    }}),{headers:{'Content-Type':'text/event-stream'}});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate(`(() => {const state=calendarLedgerPreview.getState();state.chat=[];state.chatBranches=[];state.aiSummary=null;localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify(state));localStorage.setItem('calendar-ledger-ai-config',JSON.stringify({mode:'demo',baseURL:'https://api.deepseek.com',model:'deepseek-flash',effort:'none',autoSummary:false}));location.reload();})()`);await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate(`document.querySelector('[data-action=open-ai]').click();document.querySelector('[data-action=ai-connection]').click()`);
  await check('API setup opens directly from chat without visiting general settings',`!!document.querySelector('form[data-form=ai-connection]')&&document.body.classList.contains('ai-visible')`);
  await evaluate(`var f=document.querySelector('form[data-form=ai-connection]');f.elements.provider.value='newapi';f.elements.provider.dispatchEvent(new Event('change',{bubbles:true}));f.elements.baseURL.value='https://gateway.example/v1';f.elements.apiKey.value='conversation-test-only';f.elements.model.value='analysis-model';f.elements.thinkingFormat.value='deepseek';f.requestSubmit()`);await waitFor(`!document.querySelector('.modal')&&calendarLedgerPreview.getConfig().configured`);
  await check('direct API save activates remote chat mode',`calendarLedgerPreview.getConfig().mode==='deepseek'`);
  await evaluate(`globalThis.originalInput=document.querySelector('#chat-input');globalThis.beforeBusiness=JSON.stringify(calendarLedgerPreview.getState().transactions);`);
  await send('我想学习编程，请详细分析怎样开始，不改日历。');
  await waitFor(`document.querySelector('#chat-messages').textContent.includes('把复杂问题拆小')&&!document.querySelector('.stop-button').hidden`);
  await check('actual SSE displays partial reply before response completes',`calendarLedgerPreview.getState().chat.at(-1).role==='user'&&document.querySelector('#chat-form button[type=submit]').disabled`);
  await check('reasoning returned by provider has its own expandable section',`!document.querySelector('.reasoning-block').hidden&&document.querySelector('[data-reasoning-body]').textContent.includes('用户目标')`);
  await evaluate(`document.querySelector('.reasoning-block').open=true;globalThis.streamNode=document.querySelector('#chat-messages').lastElementChild;globalThis.streamText=streamNode.querySelector('[data-message-body]')`);
  await new Promise(resolve=>setTimeout(resolve,400));
  await check('streaming patches text without replacing message or composer nodes',`streamNode===document.querySelector('#chat-messages').lastElementChild&&streamText===streamNode.querySelector('[data-message-body]')&&originalInput===document.querySelector('#chat-input')&&document.querySelector('.reasoning-block').open`);
  await waitFor(`document.querySelector('#chat-scroll').scrollHeight>document.querySelector('#chat-scroll').clientHeight+300`);
  await evaluate(`var scroll=document.querySelector('#chat-scroll');scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:-700}));scroll.scrollTop=0`);
  await waitFor(idle);await new Promise(resolve=>setTimeout(resolve,400));
  await check('reading earlier text during generation does not jump to bottom',`document.querySelector('#chat-scroll').scrollTop<2&&!document.querySelector('[data-action=latest-messages]').hidden`);
  await check('final long response renders headings lists tables and code',`document.querySelectorAll('.markdown-body h2').length>0&&!!document.querySelector('.markdown-body ol')&&!!document.querySelector('.markdown-body table')&&!!document.querySelector('.markdown-body pre')&&calendarLedgerPreview.getState().chat.at(-1).text.length>800`);
  await check('discussion leaves bookkeeping untouched',`beforeBusiness===JSON.stringify(calendarLedgerPreview.getState().transactions)&&calendarLedgerPreview.getState().chat.at(-1).results.length===0`);
  assert.equal(lastWire.stream,true);assert.equal(lastWire.max_tokens,8192);
  await evaluate(`document.querySelector('.reasoning-block').open=false;document.querySelector('#chat-scroll').scrollTop=0`);
  async function shot(name){const png=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(png.data,'base64'));}
  await shot('mobile-conversation-v0.3.8.png');
  await evaluate(`document.querySelector('#chat-input').value='切换模型后保留的草稿';document.querySelector('#chat-input').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#chat-model-button').click()`);await waitFor(`document.querySelectorAll('[data-model-choice]').length===2`);
  await shot('mobile-chat-model-picker-v0.3.8.png');
  await check('model picker exposes search thinking and length beside active chat',`!!document.querySelector('[data-model-search]')&&!!document.querySelector('[name=maxTokens]')&&document.querySelector('[name=effort]').getBoundingClientRect().height>=44`);
  await evaluate(`document.querySelector('[data-model-search]').value='fast';document.querySelector('[data-model-search]').dispatchEvent(new Event('input',{bubbles:true}))`);
  await check('model list search filters available API models',`document.querySelectorAll('[data-model-choice]').length===1&&document.querySelector('[data-model-choice]').dataset.modelChoice==='fast-model'`);
  await evaluate(`document.querySelector('[data-model-choice]').click()`);await waitFor(`!document.querySelector('.modal')&&calendarLedgerPreview.getConfig().model==='fast-model'`);
  await check('one-click model switch preserves draft and current conversation',`document.querySelector('#chat-input').value==='切换模型后保留的草稿'&&calendarLedgerPreview.getState().chat.length===2`);
  mode='stop';await send('继续聊聊');await waitFor(`!document.querySelector('.stop-button').hidden&&document.querySelector('#chat-messages').lastElementChild.textContent.includes('把复杂问题拆小')`);
  await evaluate(`document.querySelector('[data-action=stop-chat]').click()`);await waitFor(idle);await new Promise(resolve=>setTimeout(resolve,150));
  await check('stopping retains partial text and leaves an explicit status',`calendarLedgerPreview.getState().chat.at(-1).text.includes('把复杂问题拆小')&&calendarLedgerPreview.getState().chat.at(-1).status.includes('已停止')`);assert.ok(abortCount>0);findings.push({check:'stop aborts upstream HTTP stream',passed:true});
  await evaluate(`location.reload()`);await waitFor('!!globalThis.calendarLedgerPreview');await evaluate(`document.querySelector('[data-action=open-ai]').click()`);
  await check('reload preserves model long answer and stopped reply',`calendarLedgerPreview.getConfig().model==='fast-model'&&calendarLedgerPreview.getState().chat[1].text.length>800&&calendarLedgerPreview.getState().chat.at(-1).status.includes('已停止')`);
  for(const width of [320,360,412]){await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:true});await check(width+'px phone keeps composer and controls in bounds',`document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.chat-modelbar').getBoundingClientRect().bottom<=innerHeight&&document.querySelector('.composer').getBoundingClientRect().width<=innerWidth`);}
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:430,deviceScaleFactor:1,mobile:true});await check('keyboard viewport keeps composer usable',`document.querySelector('.composer').getBoundingClientRect().top>=0&&document.querySelector('.chat-modelbar').getBoundingClientRect().bottom<=innerHeight`);
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:850,deviceScaleFactor:1,mobile:true});
  await evaluate(`(() => {const state=calendarLedgerPreview.getState();state.settings.theme='dark';localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify(state));location.reload();})()`);await waitFor('!!globalThis.calendarLedgerPreview');await evaluate(`document.querySelector('[data-action=open-ai]').click();document.querySelector('#chat-scroll').scrollTop=0`);await shot('mobile-conversation-dark-v0.3.8.png');
  await check('API secret never appears in persisted conversation data',`!JSON.stringify(localStorage).includes('conversation-test-only')`);
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(path.join(output,'conversation-results-v0.3.8.json'),JSON.stringify({passed:true,version:appVersion,findings,errors,actualModel:false,transport:'SSE fixture through real preview HTTP proxy'},null,2));console.log(JSON.stringify({passed:true,checks:findings.length}));
}catch(error){await writeFile(path.join(output,'conversation-results-v0.3.8.json'),JSON.stringify({passed:false,error:error.message,findings,errors},null,2));console.error(error.stack);process.exitCode=1;}
finally{if(ws)ws.close();if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}browser.kill();}
