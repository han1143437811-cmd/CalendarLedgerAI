// Exercise real file decoding and full image -> tool -> editable card -> save UI.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createPreviewServer} from '../server.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),output=path.join(root,'qa');
await mkdir(output,{recursive:true});
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${path.join(output,'browser-profile-voice')}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws,server;const findings=[],errors=[];
try{
  const browserURL=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Chrome did not start')),30000);browser.stderr.on('data',data=>{text+=data;const match=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});browser.on('error',reject);});
  const origin=browserURL.replace(/^ws:/,'http:').split('/devtools/')[0],targets=await(await fetch(`${origin}/json/list`)).json();ws=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let counter=0;const pending=new Map();
  ws.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id){const request=pending.get(value.id);if(request){pending.delete(value.id);clearTimeout(request.timer);value.error?request.reject(new Error(value.error.message)):request.resolve(value.result);}}else if(value.method==='Runtime.exceptionThrown')errors.push(value.params.exceptionDetails.exception?.description??value.params.exceptionDetails.text);});
  function command(method,params={}){return new Promise((resolve,reject)=>{const id=++counter,timer=setTimeout(()=>reject(new Error('Timed out '+method)),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;}
  async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,80));}throw new Error('Condition not reached '+expression);}
  async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
  async function fill(selector,value){await evaluate(`(() => {const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
  async function check(name,expression){assert.equal(await evaluate(expression),true,name);findings.push({check:name,passed:true});}
  async function screenshot(name){await evaluate('new Promise(resolve=>setTimeout(resolve,350))');const png=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name),Buffer.from(png.data,'base64'));}

  server=createPreviewServer({upstreamFetch:async url=>new Response(await readFile(path.join(root,'holidays',url.match(/\/(\d{4})\.json/)[1]+'.json'),'utf8'),{status:200})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await command('Page.enable');await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:412,height:850,deviceScaleFactor:1,mobile:true});
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate('localStorage.clear();location.reload()');await waitFor('!!globalThis.calendarLedgerPreview');await click('.mobile-nav [data-action=open-ai]');
  await fill('#chat-input','保留这条待发送的文字');
  await evaluate(`globalThis.__original=document.querySelector('#chat-input');globalThis.__voiceBefore=JSON.stringify({transactions:calendarLedgerPreview.getState().transactions,events:calendarLedgerPreview.getState().events});globalThis.__instances=[];globalThis.SpeechRecognition=class{constructor(){__instances.push(this);}start(){this.onstart();}stop(){this.onresult({results:[Object.assign([{transcript:'今天午饭三十八元'}],{isFinal:true})]});this.onend();}abort(){this.onend();}};`);
  await click('.mic-button');await evaluate(`__instances.at(-1).onerror({error:'not-allowed'});__instances.at(-1).onend()`);
  await check('permission failure shows persistent actionable alert and releases send',`!document.querySelector('#voice-error').hidden && document.querySelector('#voice-error').getAttribute('role')==='alert' && document.querySelector('#voice-error-message').textContent.includes('允许') && !document.querySelector('#chat-form button[type=submit]').disabled`);
  await evaluate('new Promise(resolve=>setTimeout(resolve,3800))');
  await check('error survives toast duration without replacing input or losing draft',`!document.querySelector('#voice-error').hidden && document.querySelector('#chat-input')===__original && __original.value==='保留这条待发送的文字'`);
  for(const width of [360,393,412]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:420,deviceScaleFactor:1,mobile:true});
    await check(`voice help and composer fit a ${width}px keyboard viewport`,`(() => {const controls=[...document.querySelectorAll('.voice-help-actions button'),document.querySelector('.composer')];return document.documentElement.scrollWidth<=innerWidth&&controls.every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});})()`);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:850,deviceScaleFactor:1,mobile:true});await screenshot('v0.2.2-voice-error.png');
  await click('[data-action=voice-permissions]');await check('browser permission action explains where to enable microphone',`document.querySelector('#toast').textContent.includes('网站权限') && !document.querySelector('#voice-error').hidden`);
  await click('[data-action=voice-dismiss]');await check('dismiss only clears error and keeps original draft',`document.querySelector('#voice-error').hidden && __original.value==='保留这条待发送的文字'`);
  await click('.mic-button');await evaluate(`__instances.at(-1).onerror({error:'not-allowed'});__instances.at(-1).onend()`);await click('[data-action=voice-start]');
  await check('retry clears old error and enters recording',`document.querySelector('#voice-error').hidden && !document.querySelector('#voice-status').hidden && document.querySelector('.mic-button').classList.contains('recording')`);
  await click('[data-action=voice-stop]');await check('retry result appends editable text without automatically writing a record',`__original.value==='保留这条待发送的文字，今天午饭三十八元' && JSON.stringify({transactions:calendarLedgerPreview.getState().transactions,events:calendarLedgerPreview.getState().events})===__voiceBefore`);
  await click('.mic-button');await evaluate(`__instances.at(-1).onerror({error:'not-allowed'});__instances.at(-1).onend()`);await click('[data-action=voice-keyboard]');
  await check('keyboard fallback focuses same input and releases recording and alert',`document.activeElement===__original && document.querySelector('#voice-error').hidden && document.querySelector('#voice-status').hidden && !document.querySelector('#chat-form button[type=submit]').disabled`);
  assert.equal(errors.length,0,errors.join('\n'));await writeFile(path.join(output,'voice-ui-v0.2.2-results.json'),JSON.stringify({passed:true,checks:findings.length,findings,errors,speechCallbacksMocked:true},null,2));console.log(JSON.stringify({passed:true,checks:findings.length,findings},null,2));
}catch(error){await writeFile(path.join(output,'voice-ui-v0.2.2-results.json'),JSON.stringify({passed:false,error:error.stack,findings,errors},null,2));console.error(error.stack);process.exitCode=1;}
finally{ws?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));browser.kill();}
