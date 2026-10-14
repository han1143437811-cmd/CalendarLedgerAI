import test from 'node:test';
import assert from 'node:assert/strict';
const calls=[];
globalThis.CalendarAndroid={request(id,route,json){const body=JSON.parse(json);calls.push({id,route,body});const delay=route.includes('slow')?20:0;setTimeout(()=>globalThis.__calendarNativeReply(id,{status:route.includes('failed')?400:200,data:route.includes('failed')?{error:'网络失败'}:{ok:true,route,location:'下载/日历账本'}}),delay);}};
const platform=await import('../platform.mjs?native-test');
test('phone clock uses native epoch and zone, refreshes on every read and falls back safely',()=>{
  let time=Date.parse('2026-10-13T16:08:09Z');globalThis.CalendarAndroid.currentTime=()=>JSON.stringify({epochMillis:time,timeZone:'Asia/Shanghai',source:'android-system'});
  const first=platform.getDeviceTime();assert.equal(first.time,'00:08:09');assert.equal(first.source,'android-system');time+=2000;assert.equal(platform.getDeviceTime().time,'00:08:11');
  globalThis.CalendarAndroid.currentTime=()=>'{bad';assert.equal(Number.isFinite(platform.getDeviceTime().epochMillis),true);delete globalThis.CalendarAndroid.currentTime;
});
test('手机桥接按请求ID匹配响应，支持并发及错误状态',async()=>{
  assert.equal(platform.isAndroid,true);
  const [slow,fast]=await Promise.all([platform.apiFetch('/api/slow'),platform.apiFetch('/api/fast')]);
  assert.equal((await slow.json()).route,'/api/slow');assert.equal((await fast.json()).route,'/api/fast');
  const failed=await platform.apiFetch('/api/failed');assert.equal(failed.status,400);assert.equal((await failed.json()).error,'网络失败');
});
test('手机配置和导出使用原生接口，传递真实文件内容与格式',async()=>{
  await platform.apiFetch('/api/config',{method:'POST',body:JSON.stringify({model:'mock-model',apiKey:'test-only-key'})});
  assert.equal(calls.at(-1).body.apiKey,'test-only-key');
  const download=await platform.saveDownload({filename:'backup.json',data:'{"version":1}',format:'json'});
  assert.equal(download.location,'下载/日历账本');assert.equal(calls.at(-1).route,'/api/download');
  assert.deepEqual(calls.at(-1).body,{filename:'backup.json',data:'{"version":1}',format:'json'});
});
test('连续日程修改只将最终状态同步至手机提醒接口',async()=>{
  const state={events:[{id:'a'}],settings:{theme:'light'},dataMode:'personal'};
  platform.syncDevice(state);state.events=[{id:'b'}];platform.syncDevice(state);
  await new Promise(resolve=>setTimeout(resolve,320));
  const syncCalls=calls.filter(c=>c.route==='/api/device-sync');assert.equal(syncCalls.length,1);
  assert.deepEqual(syncCalls[0].body.events,[{id:'b'}]);assert.equal(syncCalls[0].body.dataMode,'personal');
});

test('原生语音按会话匹配结果，取消后迟到的识别不覆盖新草稿',()=>{
  const commands=[],events=[];
  globalThis.CalendarAndroid.startVoice=id=>commands.push({action:'start',id});
  globalThis.CalendarAndroid.stopVoice=id=>commands.push({action:'stop',id});
  globalThis.CalendarAndroid.cancelVoice=id=>commands.push({action:'cancel',id});
  const voice=platform.createVoiceInput(event=>events.push(event));
  voice.start();const first=commands.at(-1).id;
  globalThis.__calendarVoiceEvent({session:first,state:'partial',text:'午饭'});
  assert.equal(events.at(-1).text,'午饭');assert.equal(voice.active(),true);
  voice.cancel();assert.equal(events.at(-1).state,'cancelled');assert.equal(voice.active(),false);
  const count=events.length;globalThis.__calendarVoiceEvent({session:first,state:'result',text:'迟到的旧结果'});assert.equal(events.length,count);
  voice.start();const second=commands.at(-1).id;assert.notEqual(first,second);
  globalThis.__calendarVoiceEvent({session:first,state:'error',error:'旧错误'});assert.equal(voice.active(),true);
  voice.stop();assert.equal(commands.at(-1).action,'stop');
  globalThis.__calendarVoiceEvent({session:second,state:'result',text:'午饭38元'});assert.equal(events.at(-1).text,'午饭38元');assert.equal(voice.active(),false);
});
