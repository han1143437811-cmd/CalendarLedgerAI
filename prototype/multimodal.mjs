import {uid,validDate,validateTransaction,validateEvent,dispatch} from './core.mjs';

export const IMAGE_LIMITS=Object.freeze({count:3,fileBytes:20*1024*1024,uploadBytes:1536*1024,longEdge:2400});
const imagePattern=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const fields={type:{type:'string',enum:['transaction','event']},date:{type:'string',description:'确认后的 YYYY-MM-DD，缺失日期先询问用户'},amount:{type:'number',description:'人民币元，最多两位小数'},kind:{type:'string',enum:['expense','income','refund','transfer']},note:{type:'string'},category:{type:'string'},account:{type:'string'},ledger:{type:'string'},title:{type:'string'},time:{type:'string',description:'HH:MM'},duration:{type:'integer'},reminder:{type:'integer'},calendar:{type:'string'},notes:{type:'string'}};
const tool=(name,description,properties,required)=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
export const DRAFT_TOOLS=[
  tool('prepare_records','将截图中已辨认的账目或日程生成待核对卡片，不写入账本。金额或日期不清先询问。',{records:{type:'array',minItems:1,maxItems:20,items:{type:'object',properties:fields,required:['type','date'],additionalProperties:false}},warnings:{type:'array',maxItems:10,items:{type:'string'}}},['records']),
  tool('edit_prepared_record','修改还未保存的识别卡片，使用卡片的实际 ID。',{draftId:{type:'string'},recordId:{type:'string'},changes:{type:'object',properties:Object.fromEntries(Object.entries(fields).filter(([key])=>key!=='type')),additionalProperties:false}},['draftId','recordId','changes']),
  tool('save_prepared_records','用户明确要求保存时，将待核对卡片保存。默认只保存已勾选的项，已保存项不重复写入。',{draftId:{type:'string'},recordIds:{type:'array',items:{type:'string'}}},['draftId'])
];
export const IMAGE_READ_TOOLS=new Set(['web_search','read_webpage','query_corrections','get_app_context','search_transactions','search_events','search_tasks','query_cashflow','compare_cashflow','get_settings','get_holidays','find_free_slots','prepare_records','edit_prepared_record']);

export function assertVisionConfig(config){
  if(config.mode==='demo')throw new Error('截图识别需要连接支持识图的 API。请到“更多 → AI 与设置”填写你的 API；本地演示可以使用文字和语音。');
  if(!config.configured)throw new Error('请先在“更多 → AI 与设置”配置 API Key 并测试连接。');
  let host;try{host=new URL(config.baseURL).hostname;}catch{throw new Error('API 地址无效，请检查设置。');}
  if(host==='api.deepseek.com'&&/reasoner|(?:v4[-_])?pro/i.test(config.model))throw new Error('当前 DeepSeek 模型不支持图片。请在设置中选择支持识图的 deepseek-flash，或填写兼容的视觉模型。');
}
export function buildUserContent(text,images=[]){
  if(!images.length)return text;
  if(images.length>IMAGE_LIMITS.count)throw new Error('一次最多发送 3 张图片。');
  return [{type:'text',text:text||'请识别这些图片里的账目或日程，先生成待核对卡片。'},...images.map(image=>{
    if(!imagePattern.test(image.dataURL??'')||image.dataURL.length>Math.ceil(IMAGE_LIMITS.uploadBytes*4/3)+100)throw new Error('图片格式或大小不符合要求，请重新选择。');
    return {type:'image_url',image_url:{url:image.dataURL}};
  })];
}
// Retain only the current image turn in memory; snapshots contain small thumbnails.
export function releaseOldImages(messages){for(const message of messages){if(Array.isArray(message.content))message.content=message.content.map(part=>part.type==='image_url'?{type:'text',text:'[此前图片已识别；请参考已返回的卡片和工具结果]'}:part).map(part=>part.text).join('\n');}}
export async function readImageFile(file){
  if(!file||file.size===0||file.size>IMAGE_LIMITS.fileBytes)throw new Error('请选择不超过 20 MB 的截图或照片。');
  if(file.type&&!file.type.startsWith('image/'))throw new Error('请选择图片文件。');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;await image.decode();
    const rawWidth=image.naturalWidth,rawHeight=image.naturalHeight;
    if(!rawWidth||!rawHeight||rawWidth*rawHeight>100_000_000)throw new Error('图片分辨率过大，请先裁剪后发送。');
    let scale=Math.min(1,IMAGE_LIMITS.longEdge/Math.max(rawWidth,rawHeight)),canvas=document.createElement('canvas'),dataURL;
    for(let attempt=0;attempt<7;attempt++){
      canvas.width=Math.max(1,Math.round(rawWidth*scale));canvas.height=Math.max(1,Math.round(rawHeight*scale));
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      dataURL=canvas.toDataURL('image/jpeg',Math.max(.7,.92-attempt*.035));
      if(dataURL.length<=Math.ceil(IMAGE_LIMITS.uploadBytes*4/3)+30)break;
      scale*=.82;
    }
    if(dataURL.length>Math.ceil(IMAGE_LIMITS.uploadBytes*4/3)+30)throw new Error('图片内容过大，请裁剪后重试。');
    const thumbnail=document.createElement('canvas'),ratio=Math.min(1,280/Math.max(rawWidth,rawHeight));thumbnail.width=Math.max(1,Math.round(rawWidth*ratio));thumbnail.height=Math.max(1,Math.round(rawHeight*ratio));
    const ctx=thumbnail.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,thumbnail.width,thumbnail.height);ctx.drawImage(image,0,0,thumbnail.width,thumbnail.height);
    const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    return {id:uid('image'),name:String(file.name||'截图').slice(0,100),hash,dataURL,thumbnail:thumbnail.toDataURL('image/jpeg',.8),width:canvas.width,height:canvas.height,longImage:rawHeight/rawWidth>4};
  }catch(error){if(error.message.startsWith('图片'))throw error;throw new Error('无法读取这张图片，请换用 JPG、PNG 或 WebP 截图。');}
  finally{URL.revokeObjectURL(url);}
}

function canonicalRecord(state,type,data){
  validDate(data.date); // Never substitute today's date for a missing image date.
  if(Object.keys(data).some(key=>!Object.hasOwn(fields,key)))throw new Error('卡片包含未定义的字段。');
  if(type==='transaction'){
    const row=validateTransaction(data);delete row.id;row.amount=Number((row.amount/100).toFixed(2));return row;
  }
  if(type==='event'){const row=validateEvent({...data,repeat:'none'},state);delete row.id;delete row.exceptions;return row;}
  throw new Error('仅支持账目或日程卡片。');
}
export function duplicateRecord(state,type,data){
  return type==='transaction'?state.transactions.some(row=>row.date===data.date&&row.amount===Math.round(data.amount*100)&&row.kind===data.kind&&row.account===data.account):state.events.some(row=>row.date===data.date&&row.time===data.time&&row.title===data.title);
}
export function prepareRecords(state,args,sourceHashes=[]){
  if(!Array.isArray(args.records)||!args.records.length||args.records.length>20)throw new Error('一次识别需要 1—20 条卡片。');
  const withinBatch=new Set();
  const records=args.records.map(input=>{
    const {type,...rest}=input,data=canonicalRecord(state,type,rest),key=type==='transaction'?JSON.stringify([data.date,data.amount,data.kind,data.account]):JSON.stringify([data.date,data.time,data.title]);
    const duplicate=duplicateRecord(state,type,data)||withinBatch.has(key);withinBatch.add(key);
    return {id:uid('draftrow'),type,data,duplicate,selected:!duplicate,saved:false};
  });
  return {ok:true,type:'drafts',draftId:uid('draft'),records,warnings:Array.isArray(args.warnings)?args.warnings.slice(0,10).map(text=>String(text).slice(0,300)):[],sourceHashes:sourceHashes.slice(0,3)};
}
export function editPreparedRecord(state,draft,recordId,changes){
  if(!draft||draft.type!=='drafts')throw new Error('找不到这组识别卡片。');
  const record=draft.records.find(row=>row.id===recordId);if(!record||record.saved)throw new Error('卡片已保存或不存在，请通过账本修改已保存的记录。');
  if(!changes||Array.isArray(changes)||Object.keys(changes).some(key=>!Object.hasOwn(fields,key)||key==='type'))throw new Error('卡片修改字段无效。');
  const merged={...record.data,...changes};delete merged.repeat;delete merged.until;
  const data=canonicalRecord(state,record.type,merged);record.data=data;record.duplicate=duplicateRecord(state,record.type,data);
  return {ok:true,type:'draft_edited',draftId:draft.draftId,recordId};
}
export function savePreparedRecords(state,draft,recordIds){
  if(!draft||draft.type!=='drafts')throw new Error('找不到这组识别卡片。');
  if(recordIds!==undefined&&(!Array.isArray(recordIds)||recordIds.some(id=>!draft.records.some(row=>row.id===id))))throw new Error('请选择这组卡片内的记录。');
  const selected=draft.records.filter(row=>!row.saved&&(recordIds?recordIds.includes(row.id):row.selected));
  if(!selected.length)return {ok:true,type:'prepared_saved',draftId:draft.draftId,count:0,operations:[],message:'没有未保存的勾选项，已保存的记录不会重复写入。'};
  for(const row of selected){const data={...row.data};delete data.repeat;delete data.until;canonicalRecord(state,row.type,data);}
  // Validate the entire batch before any business write, then use the existing undo engine.
  const operations=[],transactions=selected.filter(row=>row.type==='transaction');
  if(transactions.length){const result=dispatch(state,'create_transactions',{items:transactions.map(row=>row.data)});if(!result.ok)throw new Error(result.error);operations.push({id:uid('res'),name:'create_transactions',result});transactions.forEach((row,index)=>{row.saved=true;row.savedId=result.items[index].id;});}
  for(const row of selected.filter(row=>row.type==='event')){const result=dispatch(state,'create_event',row.data);if(!result.ok)throw new Error(result.error);row.saved=true;row.savedId=result.items[0].id;operations.push({id:uid('res'),name:'create_event',result});}
  return {ok:true,type:'prepared_saved',draftId:draft.draftId,count:selected.length,operations};
}
