export const THINKING_LEVELS=[{value:'none',label:'关闭'},{value:'low',label:'轻度'},{value:'high',label:'深度'},{value:'max',label:'最大'}];
export function isDeepSeek(baseURL){try{return new URL(baseURL).hostname==='api.deepseek.com';}catch{return false;}}
export function completionOptions(baseURL,effort='none',{summary=false}={}){
  if(!THINKING_LEVELS.some(row=>row.value===effort))throw new Error('思考强度无效。');
  if(summary)return {...(isDeepSeek(baseURL)?{thinking:{type:'disabled'},reasoning_effort:'none'}:{}),max_tokens:1600,response_format:{type:'json_object'}};
  if(!isDeepSeek(baseURL))return {max_tokens:2048};
  return {thinking:{type:effort==='none'?'disabled':'enabled'},reasoning_effort:effort,max_tokens:({none:2048,low:8192,high:16384,max:32768})[effort]};
}
export function modelLabel(model){return ({'deepseek-flash':'DeepSeek Flash','deepseek-v4-pro':'DeepSeek V4 Pro'})[model]??model;}
