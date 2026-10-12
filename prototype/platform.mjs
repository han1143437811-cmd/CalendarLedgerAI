export const isAndroid = !!globalThis.CalendarAndroid;
export function getNativeSnapshot(){if(!isAndroid||typeof globalThis.CalendarAndroid.loadSnapshot!=='function')return null;try{return JSON.parse(globalThis.CalendarAndroid.loadSnapshot()||'null');}catch{return null;}}
export function saveNativeSnapshot(snapshot){if(!isAndroid)return false;if(typeof globalThis.CalendarAndroid.saveSnapshot!=='function'||!globalThis.CalendarAndroid.saveSnapshot(JSON.stringify(snapshot)))throw new Error('手机保存失败，请先导出备份后再关闭应用。');return true;}
const pending = new Map();let counter=0;
if(isAndroid)globalThis.__calendarNativeReply=(id,value)=>{const request=pending.get(id);if(!request)return;pending.delete(id);clearTimeout(request.timeout);request.resolve(value);};
export function nativeRequest(route,body={}){return new Promise((resolve,reject)=>{const id=String(++counter),timeout=setTimeout(()=>{pending.delete(id);reject(new Error('手机网络请求超时，请稍后重试。'));},route==='/api/chat'&&body.effort&&body.effort!=='none'?315000:125000);pending.set(id,{resolve,reject,timeout});try{globalThis.CalendarAndroid.request(id,route,JSON.stringify(body));}catch(e){pending.delete(id);clearTimeout(timeout);reject(e);}});}
export async function apiFetch(route,options={}){if(!isAndroid)return fetch(route,options);const response=await nativeRequest(route,options.body?JSON.parse(options.body):{});return new Response(JSON.stringify(response.data),{status:response.status,headers:{'Content-Type':'application/json'}});}
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
