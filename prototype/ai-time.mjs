// Device time is supplied by the client, never inferred from the API server.
const CLOCK_MARKER='[应用提供的实时设备时间]';
const pad=value=>String(value).padStart(2,'0');
const weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
export function deviceTime({now=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,source='browser-system'}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('设备时间无效。');
  const zone=timeZone||'UTC';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const fields=Object.fromEntries(parts.map(row=>[row.type,row.value]));
  const date=fields.year+'-'+fields.month+'-'+fields.day,time=fields.hour+':'+fields.minute+':'+fields.second;
  const localAsUTC=Date.UTC(Number(fields.year),Number(fields.month)-1,Number(fields.day),Number(fields.hour),Number(fields.minute),Number(fields.second));
  const offsetMinutes=Math.round((localAsUTC-Math.floor(now.getTime()/1000)*1000)/60000),absolute=Math.abs(offsetMinutes);
  const utcOffset=(offsetMinutes<0?'-':'+')+pad(Math.floor(absolute/60))+':'+pad(absolute%60);
  return {epochMillis:now.getTime(),date,time,weekday:weekdays[new Date(localAsUTC).getUTCDay()],timeZone:zone,utcOffset,localDateTime:date+'T'+time+utcOffset,utc:now.toISOString(),source};
}
export function normalizeDeviceTime(value){
  if(!value||!Number.isInteger(value.epochMillis)||!Number.isFinite(new Date(value.epochMillis).getTime())||typeof value.timeZone!=='string'||value.timeZone.length>100)return null;
  try{return deviceTime({now:new Date(value.epochMillis),timeZone:value.timeZone,source:value.source==='android-system'?'android-system':'browser-system'});}catch{return null;}
}
export function describeTime(value){const clock=normalizeDeviceTime(value);return clock?clock.date+' '+clock.time+' '+clock.weekday+' '+clock.timeZone+' (UTC'+clock.utcOffset+')':'';}
export function withDeviceTime(messages,clock,turnTime=null){
  const current=normalizeDeviceTime(clock);if(!current)throw new Error('无法取得设备当前时间。');
  const sent=normalizeDeviceTime(turnTime);
  const context={currentRequestTime:current,...(sent?{userMessageTime:sent}:{})};
  const content=CLOCK_MARKER+'\n'+JSON.stringify(context)+'\n当前时间来自用户设备系统时钟，精确到秒，为本次请求发送时刻。回答“现在几点”等问题时使用 currentRequestTime 的当地时间；安排“半小时后”、解释本轮“今天/明天”等相对日期时，以 userMessageTime 为基准，未提供时才使用 currentRequestTime。历史消息和摘要中的时间不是现在；当前查看的日历月份或选中日期也不代表今天。跨午夜时明确具体日期。用户明确指定的日期、时间、时区优先；UTC 时间用于同一时刻的换算，不把 UTC 日期直接当用户当地日期。无需联网查询设备时间。';
  const wire=messages.filter(row=>!(row.role==='system'&&typeof row.content==='string'&&row.content.startsWith(CLOCK_MARKER)));
  const index=wire[0]?.role==='system'?1:0;
  return [...wire.slice(0,index),{role:'system',content},...wire.slice(index)];
}
