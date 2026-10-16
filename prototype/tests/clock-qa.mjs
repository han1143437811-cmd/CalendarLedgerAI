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
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${path.join(output,'browser-profile-clock')}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
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
  const initialTime=Date.parse('2026-10-13T15:59:50Z');
  await command('Emulation.setTimezoneOverride',{timezoneId:'Asia/Shanghai'});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.__clockFakeMs=${initialTime};const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[globalThis.__clockFakeMs]));}static now(){return globalThis.__clockFakeMs;}};`});
  let phase='current',requests=[],summaryRequest;const contexts=[];
  const clockData=wire=>{const rows=wire.messages.filter(row=>row.role==='system'&&typeof row.content==='string'&&row.content.startsWith('[应用提供的实时设备时间]'));assert.equal(rows.length,1);return JSON.parse(rows[0].content.split('\n')[1]);};
  server=createPreviewServer({upstreamFetch:async(url,options={})=>{
    if(/\/\d{4}\.json/.test(url)){const year=url.match(/\/(\d{4})\.json/)[1];return new Response(await readFile(path.join(root,'holidays',year+'.json'),'utf8'));}
    if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'clock-model'}]}),{headers:{'Content-Type':'application/json'}});
    const wire=JSON.parse(options.body),context=clockData(wire);requests.push(wire);contexts.push(context);let message;
    if(wire.response_format?.type==='json_object'){summaryRequest=wire;message={role:'assistant',content:JSON.stringify({summary:'用户于2026-10-14零点要求半小时后休息，已创建2026-10-14 00:30日程。'})};}
    else if(phase==='schedule'&&wire.messages.at(-1).role==='user'){
      await evaluate(`__clockFakeMs=Date.parse('2026-10-13T16:01:03Z')`);
      message={role:'assistant',content:null,reasoning_content:'以用户发送时间确定半小时后的日期和时刻。',tool_calls:[{id:'clock-create',type:'function',function:{name:'create_event',arguments:JSON.stringify({title:'休息',date:'2026-10-14',time:'00:30',duration:15})}}]};
    }else{const c=context.currentRequestTime;message={role:'assistant',content:`本次手机时间为 ${c.date} ${c.time}，${c.weekday}，${c.timeZone}，UTC${c.utcOffset}。`,reasoning_content:'按本次请求提供的设备时间回答。'};}
    return new Response(JSON.stringify({model:'clock-model',choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]}),{headers:{'Content-Type':'application/json'}});
  }});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate(`(() => {const state=calendarLedgerPreview.getState();state.chat=[];state.chatBranches=[];state.events=[];state.aiSummary=null;state.viewMonth='2027-05';state.selectedDate='2027-05-01';localStorage.setItem(${JSON.stringify(STORAGE_KEY)},JSON.stringify(state));localStorage.setItem('calendar-ledger-ai-config',JSON.stringify({mode:'demo',baseURL:'https://api.deepseek.com',model:'deepseek-flash',effort:'none',autoSummary:false}));location.reload();})()`);await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate(`document.querySelector('[data-action=open-ai]').click();document.querySelector('[data-action=ai-connection]').click();var f=document.querySelector('form[data-form=ai-connection]');f.elements.provider.value='newapi';f.elements.provider.dispatchEvent(new Event('change',{bubbles:true}));f.elements.baseURL.value='https://gateway.example/v1';f.elements.apiKey.value='clock-browser-fixture';f.elements.model.value='clock-model';f.elements.thinkingFormat.value='deepseek';f.requestSubmit()`);await waitFor(`!document.querySelector('.modal')&&calendarLedgerPreview.getConfig().configured`);
  await send('现在是星期几，几点？');await waitFor(idle);
  assert.equal(contexts.at(-1).currentRequestTime.date,'2026-10-13');assert.equal(contexts.at(-1).currentRequestTime.time,'23:59:50');assert.equal(contexts.at(-1).currentRequestTime.weekday,'星期二');findings.push({check:'upstream receives exact browser device date time weekday and timezone',passed:true});
  await check('selected future calendar date does not override current clock',`calendarLedgerPreview.getState().selectedDate==='2027-05-01'&&calendarLedgerPreview.getState().chat.at(-1).text.includes('2026-10-13 23:59:50')`);
  await evaluate(`__clockFakeMs=Date.parse('2026-10-13T16:00:03Z')`);phase='schedule';const start=contexts.length;
  await send('半小时后安排15分钟的休息');await waitFor(idle);
  assert.equal(contexts[start].currentRequestTime.date,'2026-10-14');assert.equal(contexts[start+1].currentRequestTime.time,'00:01:03');assert.equal(contexts[start+1].userMessageTime.time,'00:00:03');findings.push({check:'tool continuation refreshes current time across midnight and preserves relative anchor',passed:true});
  await check('relative date scheduling saves actual local date and minute',`calendarLedgerPreview.getState().events.length===1&&calendarLedgerPreview.getState().events[0].date==='2026-10-14'&&calendarLedgerPreview.getState().events[0].time==='00:30'`);
  assert.ok(requests[start].messages.some(row=>typeof row.content==='string'&&row.content.includes('[历史消息发送时间：2026-10-13 23:59:50')));findings.push({check:'previous-day message carries original local timestamp in next context',passed:true});
  assert.equal(requests[start+1].messages.at(-2).reasoning_content,'以用户发送时间确定半小时后的日期和时刻。');assert.equal(requests[start+1].messages.at(-1).tool_call_id,'clock-create');findings.push({check:'clock refresh preserves exact thinking and tool-result pairing',passed:true});
  phase='current';await send('解释一下这个安排');await waitFor(idle);await send('继续讨论');await waitFor(idle);
  await evaluate(`__clockFakeMs=Date.parse('2026-10-14T16:05:00Z');document.querySelector('#chat-model-button').click()`);await waitFor(`!!document.querySelector('[data-compress-now]')`);await evaluate(`document.querySelector('[data-compress-now]').click()`);await waitFor(`!!calendarLedgerPreview.getState().aiSummary`);
  assert.equal(clockData(summaryRequest).currentRequestTime.date,'2026-10-15');assert.equal(summaryRequest.thinking.type,'disabled');assert.equal(summaryRequest.max_tokens,4096);findings.push({check:'summary API also receives freshly sampled time without changing summary options',passed:true});
  const excerpts=JSON.parse(summaryRequest.messages.findLast(row=>row.role==='user').content).excerpts;assert.equal(excerpts[0].sentAt.date,'2026-10-13');findings.push({check:'summary input preserves original message timestamps instead of redating old dialogue',passed:true});
  await evaluate(`document.querySelector('[data-action=close-modal]').click();location.reload()`);await waitFor('!!globalThis.calendarLedgerPreview');
  await check('cold reload retains original user and assistant timestamps',`calendarLedgerPreview.getState().chat[0].sentAt.date==='2026-10-13'&&!!calendarLedgerPreview.getState().chat.at(-1).sentAt.epochMillis`);
  await evaluate(`__clockFakeMs=Date.parse('2026-10-16T16:00:00Z');document.querySelector('[data-action=open-ai]').click()`);await send('重新告诉我当前时间');await waitFor(idle);assert.equal(contexts.at(-1).currentRequestTime.date,'2026-10-17');findings.push({check:'reopened conversation reads new current date instead of snapshot date',passed:true});
  await command('Emulation.setTimezoneOverride',{timezoneId:'America/New_York'});await send('现在按手机所在时区呢？');await waitFor(idle);const changed=contexts.at(-1).currentRequestTime;assert.equal(changed.timeZone,'America/New_York');assert.equal(changed.date,'2026-10-16');assert.equal(changed.time,'12:00:00');assert.equal(changed.utcOffset,'-04:00');findings.push({check:'changing device timezone is reflected without app restart',passed:true});
  await check('clock requests contain no configured API secret in local data',`!JSON.stringify(localStorage).includes('clock-browser-fixture')`);
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(path.join(output,'clock-results-v0.3.10.json'),JSON.stringify({passed:true,version:appVersion,findings,errors,actualModel:false,clockSource:'controlled client clock and timezone through actual browser app and HTTP proxy'},null,2));console.log(JSON.stringify({passed:true,checks:findings.length}));
}catch(error){await writeFile(path.join(output,'clock-results-v0.3.10.json'),JSON.stringify({passed:false,error:error.message,findings,errors},null,2));console.error(error.stack);process.exitCode=1;}
finally{if(ws)ws.close();if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}browser.kill();}
