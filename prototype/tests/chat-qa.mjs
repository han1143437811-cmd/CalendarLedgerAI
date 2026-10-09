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
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${path.join(output,'browser-profile-chat')}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
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
  server=createPreviewServer({upstreamFetch:async(url)=>{const year=url.match(/\/(\d{4})\.json/)[1];return new Response(await readFile(path.join(root,'holidays',year+'.json'),'utf8'),{status:200});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate(`(() => {const state=calendarLedgerPreview.getState();state.chat=Array.from({length:24},(_,i)=>({role:i%2?'assistant':'user',text:'历史消息 '+i+'：'+('这条记录用于验证滚动位置保持。'.repeat(5))}));localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify(state));location.reload();})()`);
  await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate('document.querySelector(".mobile-nav [data-action=open-ai]").click()');await waitFor(settled);
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await evaluate(`globalThis.__chatRefs={panel:document.querySelector('.ai-panel'),scroll:document.querySelector('#chat-scroll'),input:document.querySelector('#chat-input'),first:document.querySelector('#chat-messages .chat-message')};globalThis.__historyRemoved=0;new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===__chatRefs.first||node.contains?.(__chatRefs.first))__historyRemoved++;}).observe(__chatRefs.scroll,{childList:true,subtree:true});__chatRefs.input.focus();globalThis.__startTop=__chatRefs.scroll.scrollTop;globalThis.__trace=[];function recordChat(now){__trace.push({time:now,top:document.querySelector('#chat-scroll').scrollTop,opacity:getComputedStyle(__chatRefs.first).opacity});if(__trace.length<65)requestAnimationFrame(recordChat);}requestAnimationFrame(recordChat);`);
  await send('今天午饭35，地铁6，明天下午2点开会1小时，提前30分钟提醒');
  await check('waiting reply keeps the same focused enabled textarea',`document.querySelector('#chat-input')===__chatRefs.input && !__chatRefs.input.disabled && document.activeElement===__chatRefs.input && document.querySelector('#chat-form button[type=submit]').disabled`);
  await evaluate(`__chatRefs.input.value='回复期间输入的下一条草稿';__chatRefs.input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await waitFor(idle);await waitFor('__trace.length===65');await waitFor(settled);
  await check('tool operations preserve panel list and history nodes',`document.querySelector('.ai-panel')===__chatRefs.panel && document.querySelector('#chat-scroll')===__chatRefs.scroll && document.querySelector('#chat-messages .chat-message')===__chatRefs.first && __historyRemoved===0`);
  await check('reply completion retains focus and next-message draft',`document.activeElement===__chatRefs.input && __chatRefs.input.value==='回复期间输入的下一条草稿'`);
  trace=await evaluate('({from:__startTop,samples:__trace,to:__chatRefs.scroll.scrollTop})');
  assert.ok(trace.samples.every(x=>x.top>=trace.from-1),'list must not reset towards zero');
  const intermediatePositions=new Set(trace.samples.filter(x=>x.top>trace.from+1&&x.top<trace.to-1).map(x=>Math.round(x.top))).size;
  assert.ok(intermediatePositions>=3,'scroll has distinct intermediate positions');
  assert.ok(trace.samples.every(x=>Number(x.opacity)>.99),'historical messages never replay their fade animation');
  findings.push({check:'smooth new-message trajectory without history flashing',passed:true,start:trace.from,end:trace.to,intermediatePositions});
  await send('分析本月餐饮支出，与上月同期对比');
  await evaluate(`__chatRefs.scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:-700}));__chatRefs.scroll.scrollTop=Math.max(0,__chatRefs.scroll.scrollTop-700);globalThis.__readingTop=__chatRefs.scroll.scrollTop;`);
  await waitFor(idle);await new Promise(resolve=>setTimeout(resolve,400));
  await check('reply arriving while reading history does not pull to bottom',`Math.abs(__chatRefs.scroll.scrollTop-__readingTop)<2 && !document.querySelector('[data-action=latest-messages]').hidden`);
  await evaluate(`document.querySelector('[data-action=update-holidays]').click()`);await new Promise(resolve=>setTimeout(resolve,300));
  await check('background holiday refresh keeps chat position and DOM',`Math.abs(__chatRefs.scroll.scrollTop-__readingTop)<2 && document.querySelector('#chat-scroll')===__chatRefs.scroll && document.querySelector('#chat-input')===__chatRefs.input`);
  await evaluate(`document.querySelector('[data-action=latest-messages]').click()`);await waitFor(settled);
  await check('return to latest messages follows the current bottom',`document.querySelector('[data-action=latest-messages]').hidden`);
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:420,deviceScaleFactor:1,mobile:true});await waitFor(settled);
  await check('keyboard-sized viewport preserves textarea and composer visibility',`(() => {const box=document.querySelector('.composer').getBoundingClientRect();return document.querySelector('#chat-input')===__chatRefs.input && document.activeElement===__chatRefs.input && box.top>=0 && box.bottom<=innerHeight+1;})()`);
  await evaluate(`__chatRefs.scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:-700}));__chatRefs.scroll.scrollTop=120;globalThis.__beforeResize=__chatRefs.scroll.scrollTop;`);
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:850,deviceScaleFactor:1,mobile:true});await new Promise(resolve=>setTimeout(resolve,150));
  await check('restoring viewport does not discard a history reading position',`Math.abs(__chatRefs.scroll.scrollTop-__beforeResize)<2`);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('分析本月收支');await waitFor(idle);await waitFor(settled);
  await check('reduced-motion preference skips message animations',`getComputedStyle(document.querySelector('#chat-messages .chat-message:last-child')).animationName==='none'`);
  const png=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,'mobile-chat-v0.2.0.png'),Buffer.from(png.data,'base64'));
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(path.join(output,'chat-scroll-results.json'),JSON.stringify({passed:true,version:appVersion,findings,errors,trace,defaultReducedMotion},null,2));console.log(JSON.stringify({passed:true,checks:findings.length,findings,defaultReducedMotion},null,2));
}catch(error){await writeFile(path.join(output,'chat-scroll-results.json'),JSON.stringify({passed:false,error:error.message,findings,errors,trace,defaultReducedMotion},null,2));console.error(error.stack);process.exitCode=1;}
finally{if(ws)ws.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));browser.kill();}
