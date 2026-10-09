// Headless checks for the app being developed. Uses a disposable browser profile.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createPreviewServer} from '../server.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),output=path.join(root,'qa');
await mkdir(output,{recursive:true});
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${path.join(output,'browser-profile-festivals-v023')}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--window-size=1440,1000','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
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
  previewServer=createPreviewServer({upstreamFetch:holidayFixture});await new Promise(resolve=>previewServer.listen(0,'127.0.0.1',resolve));
  await command('Page.navigate',{url:`http://127.0.0.1:${previewServer.address().port}`});await waitFor('!!globalThis.calendarLedgerPreview');
  await evaluate('localStorage.clear();location.reload()');await waitFor('!!globalThis.calendarLedgerPreview');
  await waitFor("!!calendarLedgerPreview.getState().holidayDays['2026-10-01']");
  async function month(target){
    for(let i=0;i<30;i++){const current=await evaluate('calendarLedgerPreview.getState().viewMonth');if(current===target){await new Promise(resolve=>setTimeout(resolve,100));return;}await click(`[data-action=${current<target?'next-month':'prev-month'}]`);}
    throw new Error('Month not reached: '+target);
  }
  async function label(date,text){const actual=await evaluate(`document.querySelector('.calendar-day[data-date="${date}"] .festival-name')?.textContent`);assert.equal(actual,text,`${date} label`);}
  await label('2026-10-01','国庆节');await label('2026-10-05','国庆假期');await label('2026-10-10','国庆补班');
  assert.equal(await evaluate("document.querySelector('.calendar-day[data-date=\"2026-10-10\"] .holiday-badge').textContent"),'班');
  findings.push({check:'month displays festival, vacation and adjusted-workday names directly',passed:true});
  for(const filter of ['events','transactions','all']){await click(`[data-action=content-filter][data-filter=${filter}]`);await label('2026-10-01','国庆节');}
  findings.push({check:'festival names remain visible for every content filter',passed:true});
  await fill('#view-select','week');assert.ok(await evaluate("document.querySelector('.week-view').innerText.includes('国庆假期') && document.querySelector('.week-view').innerText.includes('国庆补班')"));
  findings.push({check:'week view includes holiday names and workday badges',passed:true});
  await fill('#view-select','month');await click('.calendar-day[data-date="2026-10-01"]');await fill('#view-select','day');
  assert.ok(await evaluate("document.querySelector('.date-group-title').textContent.includes('国庆节 · 放假')"));
  findings.push({check:'day view includes full festival and days-off detail',passed:true});await fill('#view-select','month');
  for(const [date,text]of [['2026-02-16','除夕'],['2026-02-17','春节'],['2026-03-03','元宵节'],['2026-04-05','清明节'],['2026-06-19','端午节'],['2026-08-19','七夕'],['2026-09-25','中秋节'],['2026-10-18','重阳节']]){
    await month(date.slice(0,7));await label(date,text);await click(`.calendar-day[data-date="${date}"]`);
    assert.ok(await evaluate(`document.querySelector('.day-detail .holiday-name').textContent.includes(${JSON.stringify(text)})`));
    if(date==='2026-03-03')assert.equal(await evaluate(`!!document.querySelector('.calendar-day[data-date="${date}"] .holiday-badge')`),false);
    findings.push({check:`visible ${text} on ${date}`,passed:true});
    if(text==='中秋节')await screenshot('mobile-festivals-midautumn-v0.2.3.png');
    if(text==='春节')await screenshot('mobile-festivals-spring-v0.2.3.png');
  }
  await month('2027-02');await label('2027-02-06','春节');await label('2027-02-05','除夕');
  assert.equal(await evaluate("!!document.querySelector('.calendar-day[data-date=\"2027-02-06\"] .holiday-badge')"),false);
  findings.push({check:'2027 festival visible without inventing unannounced leave schedules',passed:true});
  await month('2025-10');await label('2025-10-06','中秋节');await waitFor("!!calendarLedgerPreview.getState().holidayDays['2025-10-06']");await click('.calendar-day[data-date="2025-10-06"]');
  assert.ok(await evaluate("document.querySelector('.day-detail .holiday-name').textContent.includes('国庆')"));
  findings.push({check:'Mid-Autumn festival remains distinct inside National Day vacation',passed:true});
  for(const [width,height]of [[412,850],[384,820],[360,800]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    for(const target of ['2026-10','2026-08']){
      await month(target);await evaluate('document.querySelector(".main").scrollTop=0');await new Promise(resolve=>setTimeout(resolve,120));
      const layout=await evaluate(`(() => {const grid=document.querySelector('.calendar-grid');return {width:innerWidth,doc:document.documentElement.scrollWidth,rows:Number(grid.style.getPropertyValue('--calendar-rows')),bottom:document.querySelector('.calendar-foot').getBoundingClientRect().bottom,navTop:document.querySelector('.mobile-nav').getBoundingClientRect().top,mainBottom:document.querySelector('.main').getBoundingClientRect().bottom,detailTop:document.querySelector('.day-detail').getBoundingClientRect().top,gridHeight:grid.offsetHeight,clippedLabels:[...document.querySelectorAll('.calendar-day .festival-name')].filter(e=>{const r=e.getBoundingClientRect(),c=e.closest('.calendar-day').getBoundingClientRect();return r.height<10||r.bottom>c.bottom+1||r.right>c.right+1;}).length};})()`);
      assert.ok(layout.doc<=layout.width+1,JSON.stringify(layout));assert.ok(layout.bottom<layout.navTop,JSON.stringify(layout));assert.equal(layout.clippedLabels,0,JSON.stringify(layout));assert.ok(layout.detailTop>=layout.mainBottom,JSON.stringify(layout));if(target==='2026-10')assert.ok(layout.gridHeight>=380,JSON.stringify(layout));
      if(target==='2026-08')assert.equal(layout.rows,6);
      findings.push({check:`festival layout ${width}x${height} ${target}`,passed:true,...layout});
    }
  }
  await command('Emulation.setDeviceMetricsOverride',{width:412,height:850,deviceScaleFactor:1,mobile:true});await month('2026-10');await click('.calendar-day[data-date="2026-10-05"]');await evaluate('document.querySelector(".main").scrollTop=0');await new Promise(resolve=>setTimeout(resolve,120));await screenshot('mobile-festivals-calendar-v0.2.3.png');
  const gridHeight=await evaluate('document.querySelector(".calendar-grid").offsetHeight');
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:200,y:530,deltaX:0,deltaY:360});await waitFor('document.querySelector(".main").scrollTop>100');
  assert.ok(await evaluate(`(() => {const main=document.querySelector('.main').getBoundingClientRect(),detail=document.querySelector('.day-detail-header').getBoundingClientRect();return detail.top>=main.top && detail.bottom<main.bottom && document.querySelector('.day-detail-header').innerText.includes('10月5日') && document.querySelector('.day-detail .record-row');})()`));
  assert.equal(await evaluate('document.querySelector(".calendar-grid").offsetHeight'),gridHeight);
  findings.push({check:'scroll reveals selected daily schedules and records while month keeps its height',passed:true});await screenshot('mobile-daily-details-v0.2.3.png');
  const beforeRefresh=await evaluate('document.querySelector(".main").scrollTop');
  await fill('#chat-input','今天午饭35，地铁6，明天下午2点开会1小时，提前30分钟提醒');
  await evaluate('calendarLedgerPreview.sendChat(document.querySelector("#chat-input").value)');await waitFor('!document.querySelector("#chat-form button[type=submit]").disabled');
  await click('[data-action=close-ai]');await waitFor('!document.body.classList.contains("ai-visible")');
  await evaluate('document.querySelector(".main").scrollTop='+beforeRefresh);const scrollBefore=await evaluate('document.querySelector(".main").scrollTop');
  await click('[data-action=content-filter][data-filter=transactions]');await new Promise(resolve=>setTimeout(resolve,120));
  assert.ok(Math.abs((await evaluate('document.querySelector(".main").scrollTop'))-scrollBefore)<=2,'same-date view update retains reading position');
  await click('[data-action=content-filter][data-filter=all]');
  findings.push({check:'daily reading position survives a same-month content update',passed:true});
  assert.ok(await evaluate(`getComputedStyle(document.querySelector('.floating-add')).display==='none' && !!document.querySelector('.header-actions [data-action=new]')`));
  findings.push({check:'month dates are not covered by a floating add button and header add remains available',passed:true});
  await evaluate('document.querySelector(".main").scrollTop=0');

  await click('[data-action=settings]');await fill('select[name=theme]','dark');await fill('select[name=fontSize]','large');await evaluate('document.querySelector("form[data-form=settings]").requestSubmit()');await waitFor('!document.querySelector(".modal")');
  await label('2026-10-01','国庆节');await checkLayout('festival dark theme and large font');await screenshot('mobile-festivals-dark-v0.2.3.png');
  assert.equal(errors.length,0,errors.join('\n'));findings.push({check:'browser console errors',count:errors.length});
  await writeFile(path.join(output,'festival-results-v0.2.3.json'),JSON.stringify({passed:true,version:'0.2.3',findings,errors},null,2));console.log(JSON.stringify({passed:true,checks:findings.length,findings},null,2));
}catch(error){await writeFile(path.join(output,'festival-results-v0.2.3.json'),JSON.stringify({passed:false,error:error.message,findings,errors},null,2));console.error(error.stack);process.exitCode=1;}
finally{if(previewServer?.listening)await new Promise(resolve=>previewServer.close(resolve));if(ws){try{ws.close();}catch{}}if(firstMockServer?.listening)await new Promise(resolve=>firstMockServer.close(resolve));if(apiServer?.listening)await new Promise(resolve=>apiServer.close(resolve));browser.kill();}
