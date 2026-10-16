// Full browser app + actual HTTP proxy with controlled failing upstream summaries.
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
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${path.join(output,'browser-profile-summary')}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
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

  let phase='empty-once',summaryCount=0;const requests=[],summaries=[],fixtureKey='summary-browser-fixture-private';
  const isSummary=wire=>wire.messages[0]?.content?.startsWith('你是对话压缩器');
  server=createPreviewServer({upstreamFetch:async(url,init={})=>{
    if(/\/\d{4}\.json/.test(url))return new Response(await readFile(path.join(root,'holidays',url.match(/\/(\d{4})\.json/)[1]+'.json'),'utf8'));
    if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'deepseek-v4.1'}]}));
    const wire=JSON.parse(init.body);requests.push(wire);let content='可以继续完整讨论，摘要故障不会阻止这条正常回复。';
    if(isSummary(wire)){
      summaries.push(wire);summaryCount++;
      if(phase==='auth')return new Response(JSON.stringify({error:{message:'Authentication failed '+fixtureKey}}),{status:401});
      content=phase==='both-empty'||phase==='empty-once'&&summaryCount===1?'':wire.response_format?JSON.stringify({summary:'用户需要保留付款并按日分摊订阅，执行情况需要查询。'}):'用户需要保留付款并按日分摊订阅，执行情况需要查询真实账目。';
    }
    return new Response(JSON.stringify({model:wire.model,choices:[{message:{role:'assistant',content},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}});
  }});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await waitFor('!!globalThis.calendarLedgerPreview');
  async function seed(reset=true){
    await evaluate(`(()=>{const s=calendarLedgerPreview.getState();if(${reset}){s.chat=[];s.chatBranches=[];s.aiSummary=null;}const start=s.chat.length;for(let i=0;i<${reset?32:26};i++)s.chat.push({id:'seed'+(i+start),role:i%2?'assistant':'user',text:i%2?'助手说完成，实际待核对。':'保留付款，每天显示订阅分摊。'});localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify(s));location.reload();})()`);await waitFor('!!globalThis.calendarLedgerPreview');
  }
  await seed();
  await evaluate(`document.querySelector('[data-action=open-ai]').click();document.querySelector('[data-action=ai-connection]').click();var f=document.querySelector('form[data-form=ai-connection]');f.elements.provider.value='newapi';f.elements.provider.dispatchEvent(new Event('change',{bubbles:true}));f.elements.baseURL.value='https://summary.example/v1';f.elements.apiKey.value=${JSON.stringify(fixtureKey)};f.elements.model.value='deepseek-v4.1';f.elements.thinkingFormat.value='deepseek';f.requestSubmit()`);await waitFor(`!document.querySelector('.modal')&&calendarLedgerPreview.getConfig().configured`);
  const business=await evaluate('JSON.stringify([calendarLedgerPreview.getState().transactions,calendarLedgerPreview.getState().events,calendarLedgerPreview.getState().tasks])');
  await send('继续讨论订阅规则');await waitFor(idle);
  assert.equal(summaryCount,2);assert.equal(summaries[0].max_tokens,4096);assert.equal(summaries[0].response_format.type,'json_object');assert.equal(summaries[1].response_format,undefined);assert.equal(summaries[1].thinking,undefined);findings.push({check:'empty JSON summary uses one compatible retry through real HTTP proxy',passed:true});
  await check('configured v4.1 alias stays unchanged after recovery',`calendarLedgerPreview.getConfig().model==='deepseek-v4.1'&&calendarLedgerPreview.getState().aiSummary.model==='deepseek-v4.1'`);
  await check('ordinary answer continues after successful summary recovery',`calendarLedgerPreview.getState().chat.at(-1).text.includes('可以继续完整讨论')&&calendarLedgerPreview.getState().aiSummary.source==='api'`);
  assert.ok(summaries.every(wire=>!wire.tools));findings.push({check:'all summary requests omit business tools',passed:true});
  assert.ok(summaries[0].messages[1].content.includes('只压缩历史资料'));assert.ok(!summaries[0].messages[1].content.includes('回答“现在几点”'));findings.push({check:'summary device clock cannot turn historical questions into ordinary replies',passed:true});
  phase='both-empty';summaryCount=0;await seed();await evaluate(`document.querySelector('[data-action=open-ai]').click()`);await send('继续聊');await waitFor(idle);
  assert.equal(summaryCount,2);await check('both empty attempts fall back locally and normal chat still answers',`calendarLedgerPreview.getState().aiSummary.source==='local'&&calendarLedgerPreview.getState().chat.at(-1).text.includes('可以继续完整讨论')`);
  await check('original prefix remains in history after fallback',`calendarLedgerPreview.getState().chat[0].text==='保留付款，每天显示订阅分摊。'&&calendarLedgerPreview.getState().aiSummary.lastFailure.code==='empty'`);
  await evaluate(`document.querySelector('#chat-model-button').click()`);await waitFor(`!!document.querySelector('[data-summary-status]')`);
  await check('model menu names local fallback, exact failure and retry delay',`document.querySelector('[data-summary-status]').textContent.includes('本地原话摘录')&&document.querySelector('[data-summary-status]').textContent.includes('空正文')&&document.querySelector('[data-summary-status]').textContent.includes('分钟后')`);
  for(const width of [320,412]){await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:true});await check('summary menu fits '+width+'px mobile screen',`document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#ai-controls-panel').getBoundingClientRect().right<=innerWidth+1`);}
  await evaluate(`document.querySelector('[data-summary-status]').scrollIntoView({block:'end'})`);
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,'mobile-summary-recovery-v'+appVersion+'.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`document.querySelector('[data-action=close-modal]').click()`);const failureAt=await evaluate('calendarLedgerPreview.getState().aiSummary.lastFailure.at');await seed(false);
  await evaluate(`document.querySelector('[data-action=open-ai]').click()`);await send('重启后继续');await waitFor(idle);assert.equal(summaryCount,2);await check('cold restart retains cooldown and advances local context with zero extra API summary calls',`calendarLedgerPreview.getState().aiSummary.lastFailure.at===${failureAt}&&calendarLedgerPreview.getState().aiSummary.coveredMessages>=52`);
  phase='success';await evaluate(`document.querySelector('#chat-model-button').click()`);await waitFor(`!!document.querySelector('[data-compress-now]')`);await evaluate(`document.querySelector('[data-compress-now]').click()`);await waitFor(`calendarLedgerPreview.getState().aiSummary.source==='api'`);
  await check('manual retry recovers immediately and updates live menu status',`!calendarLedgerPreview.getState().aiSummary.lastFailure&&document.querySelector('[data-summary-status]').textContent.includes('API 摘要')`);assert.equal(summaryCount,3);
  await evaluate(`document.querySelector('[data-action=close-modal]').click()`);phase='auth';summaryCount=0;await seed();await evaluate(`document.querySelector('[data-action=open-ai]').click()`);await send('接口鉴权故障时继续');await waitFor(idle);
  assert.equal(summaryCount,1);await check('HTTP 401 is reported accurately without immediate second attempt',`calendarLedgerPreview.getState().aiSummary.lastFailure.code==='http_401'&&calendarLedgerPreview.getState().aiSummary.lastFailure.reason.includes('401')`);
  await check('gateway error never persists its echoed API secret',`!JSON.stringify(localStorage).includes(${JSON.stringify(fixtureKey)})`);
  assert.equal(await evaluate('JSON.stringify([calendarLedgerPreview.getState().transactions,calendarLedgerPreview.getState().events,calendarLedgerPreview.getState().tasks])'),business);findings.push({check:'all recovery paths leave actual money schedules and tasks unchanged',passed:true});
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(path.join(output,'summary-results-v'+appVersion+'.json'),JSON.stringify({passed:true,version:appVersion,findings,errors,actualModel:false,apiKeyUsed:false,transport:'real preview HTTP proxy and browser app; controlled summary failures'},null,2));console.log(JSON.stringify({passed:true,checks:findings.length}));
}catch(error){await writeFile(path.join(output,'summary-results-v'+appVersion+'.json'),JSON.stringify({passed:false,error:error.message,findings,errors},null,2));console.error(error.stack);process.exitCode=1;}
finally{if(ws)ws.close();if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}browser.kill();}
