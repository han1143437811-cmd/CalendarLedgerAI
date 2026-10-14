import {createChatStream} from './chat-stream.mjs';
import {deviceTime,normalizeDeviceTime} from './ai-time.mjs';
export const isAndroid = !!globalThis.CalendarAndroid;
export function getDeviceTime(){if(isAndroid&&typeof globalThis.CalendarAndroid.currentTime==='function')try{const time=normalizeDeviceTime(JSON.parse(globalThis.CalendarAndroid.currentTime()));if(time)return time;}catch{}return deviceTime();}
export function getNativeSnapshot(){if(!isAndroid||typeof globalThis.CalendarAndroid.loadSnapshot!=='function')return null;try{return JSON.parse(globalThis.CalendarAndroid.loadSnapshot()||'null');}catch{return null;}}
export function saveNativeSnapshot(snapshot){if(!isAndroid)return false;if(typeof globalThis.CalendarAndroid.saveSnapshot!=='function'||!globalThis.CalendarAndroid.saveSnapshot(JSON.stringify(snapshot)))throw new Error('手机保存失败，请先导出备份后再关闭应用。');return true;}
const pending = new Map();let counter=0;
if(isAndroid){
  globalThis.__calendarNativeReply=(id,value)=>pending.get(id)?.resolve(value);
  globalThis.__calendarNativeProgress=(id,text)=>{try{pending.get(id)?.onProgress?.(text);}catch(error){pending.get(id)?.cancel(error);}};
}
export function nativeRequest(route,body={},options={}){return new Promise((resolve,reject)=>{
  const id=String(++counter),cleanup=()=>{pending.delete(id);clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);};
  const cancel=error=>{if(!pending.has(id))return;cleanup();globalThis.CalendarAndroid.cancelRequest?.(id);reject(error);};
  const abort=()=>cancel(options.signal.reason??new DOMException('已停止生成','AbortError'));
  const timeout=setTimeout(()=>cancel(new Error('手机网络请求超时，请稍后重试。')),route==='/api/chat'?315000:125000);
  pending.set(id,{resolve:value=>{cleanup();resolve(value);},cancel,onProgress:options.onProgress});
  if(options.signal?.aborted){abort();return;}options.signal?.addEventListener('abort',abort,{once:true});
  try{globalThis.CalendarAndroid.request(id,route,JSON.stringify(body));}catch(e){cancel(e);}
});}
export async function apiFetch(route,options={}){if(!isAndroid)return fetch(route,options);const response=await nativeRequest(route,options.body?JSON.parse(options.body):{},options);return new Response(JSON.stringify(response.data),{status:response.status,headers:{'Content-Type':'application/json'}});}
export async function requestChat(body,{signal,onUpdate=()=>{}}={}){
  const stream=createChatStream(onUpdate);let data;
  if(isAndroid){const response=await nativeRequest('/api/chat',{...body,stream:true},{signal,onProgress:stream.feed});if(response.status!==200)throw new Error(response.data.error??'请求失败。');data=response.data;}
  else{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,stream:true}),signal});
    if(response.ok&&response.headers.get('content-type')?.includes('text/event-stream')){
      const reader=response.body.getReader(),decoder=new TextDecoder();try{while(true){const {done,value}=await reader.read();if(done)break;stream.feed(decoder.decode(value,{stream:true}));}stream.feed(decoder.decode());}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}data={streamed:true};
    }else{data=await response.json();if(!response.ok)throw new Error(data.error??'请求失败。');}
  }
  if(data.streamed)return stream.result();
  onUpdate({text:data.message?.content??'',reasoning:data.message?.reasoning_content??'',toolPending:!!data.message?.tool_calls?.length});return data;
}
export async function saveDownload(result){if(!isAndroid)return false;const response=await nativeRequest('/api/download',{filename:result.filename,data:result.data,format:result.format});if(response.status!==200)throw new Error(response.data.error);return response.data;}
let syncTimer;
export function syncDevice(state){if(!isAndroid)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>nativeRequest('/api/device-sync',{events:state.events,theme:state.settings.theme,dataMode:state.dataMode}).then(response=>{globalThis.calendarDeviceStatus=response.data;}).catch(()=>{}),250);}

// Speech produces editable text. It never submits a message or writes a record.
export function createVoiceInput(onEvent){
  let session='',recognizer;
  function emit(event){if(event.session!==session)return;onEvent(event);if(['result','error','cancelled'].includes(event.state))session='';}
  if(isAndroid)globalThis.__calendarVoiceEvent=emit;
  return {
    start(){
      if(session)return;
      session='voice_'+Date.now()+'_'+(++counter);
      if(isAndroid){try{globalThis.CalendarAndroid.startVoice(session);}catch{emit({session,state:'error',error:'请安装支持语音输入的新版 APK。'});}return;}
      const Speech=globalThis.SpeechRecognition??globalThis.webkitSpeechRecognition;
      if(!Speech){emit({session,state:'error',error:'此浏览器没有语音识别服务。新版手机 APK 内置中文语音识别，也可以使用键盘上的语音输入。'});return;}
      const current=session;recognizer=new Speech();recognizer.lang='zh-CN';recognizer.interimResults=true;recognizer.continuous=false;
      recognizer.onstart=()=>emit({session:current,state:'listening'});
      recognizer.onresult=event=>{const results=Array.from(event.results),text=results.map(row=>row[0].transcript).join('');emit({session:current,state:results.every(row=>row.isFinal)?'result':'partial',text});};
      recognizer.onerror=event=>emit({session:current,state:'error',error:event.error==='not-allowed'?'请允许浏览器使用麦克风，或使用键盘语音输入。':'语音识别未完成，请检查网络或重试。'});
      recognizer.onend=()=>{if(session===current)emit({session:current,state:'cancelled'});};
      try{recognizer.start();}catch{emit({session:current,state:'error',error:'无法启动语音识别，请稍后重试。'});}
    },
    stop(){if(!session)return;if(isAndroid)globalThis.CalendarAndroid.stopVoice(session);else recognizer?.stop();},
    cancel(){if(!session)return;const current=session;if(isAndroid)globalThis.CalendarAndroid.cancelVoice(current);else recognizer?.abort();emit({session:current,state:'cancelled'});},
    active:()=>!!session
  };
}
