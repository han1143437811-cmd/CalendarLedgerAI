import {normalizeSummary} from './ai-summary.mjs';
export const CHAT_BRANCH_LIMIT=12;
const clone=value=>JSON.parse(JSON.stringify(value));
const newId=()=> 'chat_'+crypto.randomUUID().replaceAll('-','');
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const fields=['chat','aiChatArchive','aiSummary','lastCreated'];
function capture(state,draft=''){
  return {chat:clone(state.chat??[]),aiChatArchive:clone(state.aiChatArchive??[]),aiSummary:clone(state.aiSummary??null),lastCreated:clone(state.lastCreated??[]),draft:String(draft)};
}
function normalizeData(data){
  if(!data||!Array.isArray(data.chat)||data.chat.length>200||!Array.isArray(data.aiChatArchive)||data.aiChatArchive.length>80)throw new Error('分支聊天格式无效。');
  if(data.chat.some(row=>!row||!validId(row.id)||!['user','assistant'].includes(row.role)||typeof row.text!=='string'))throw new Error('分支消息无效。');
  return {...clone(data),aiSummary:normalizeSummary(data.aiSummary),lastCreated:Array.isArray(data.lastCreated)?clone(data.lastCreated).slice(-20):[],draft:typeof data.draft==='string'?data.draft:''};
}
export function initializeChatBranches(state,saved={}){
  try{
    const rows=saved.chatBranches;
    if(!Array.isArray(rows)||!rows.length||rows.length>CHAT_BRANCH_LIMIT||!validId(saved.activeChatBranchId))throw new Error('分支列表无效。');
    const ids=new Set();state.chatBranches=rows.map(row=>{
      if(!row||!validId(row.id)||ids.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>40)throw new Error('分支信息无效。');ids.add(row.id);
      return {id:row.id,title:row.title,createdAt:String(row.createdAt??'').slice(0,40),...(validId(row.parentId)?{parentId:row.parentId}:{}),...(validId(row.forkMessageId)?{forkMessageId:row.forkMessageId}:{}),data:row.id===saved.activeChatBranchId?null:normalizeData(row.data)};
    });
    if(!ids.has(saved.activeChatBranchId))throw new Error('当前分支不存在。');state.activeChatBranchId=saved.activeChatBranchId;
    state.chatDraft=typeof saved.chatDraft==='string'?saved.chatDraft:'';
  }catch{state.chatBranches=[{id:newId(),title:'主聊天',createdAt:new Date().toISOString(),data:null}];state.activeChatBranchId=state.chatBranches[0].id;state.chatDraft='';}
  return state;
}
export function activeBranch(state){return state.chatBranches.find(row=>row.id===state.activeChatBranchId);}
export function switchChatBranch(state,id,draft=''){
  const current=activeBranch(state),target=state.chatBranches.find(row=>row.id===id);
  if(!current||!target)throw new Error('聊天分支不存在。');if(current===target)return draft;
  const next=normalizeData(target.data),old=capture(state,draft);
  current.data=old;target.data=null;state.activeChatBranchId=id;
  for(const field of fields)state[field]=next[field];state.chatDraft=next.draft;
  return next.draft;
}
export function createChatBranch(state,{messageId,title,draft=''}={}){
  if(state.chatBranches.length>=CHAT_BRANCH_LIMIT)throw new Error('最多保留12个聊天，请先删除不需要的分支。');
  const source=activeBranch(state);if(!source)throw new Error('当前聊天不存在。');
  let data={chat:[],aiChatArchive:[],aiSummary:null,lastCreated:[],draft:''};
  if(messageId){
    const index=state.chat.findIndex(row=>row.id===messageId&&row.role==='assistant');if(index<0)throw new Error('请选择已有的助手回复作为分支起点。');
    data=capture(state,'');data.chat=data.chat.slice(0,index+1).map(row=>({...row,branchReference:true}));
    if(data.aiSummary&&!data.chat.some(row=>row.id===data.aiSummary.throughId))data.aiSummary=null;
    const liveIds=new Set([...state.transactions,...state.events,...state.tasks].map(row=>row.id));
    const recent=new Map();for(const row of data.chat.flatMap(message=>message.results??[]).flatMap(entry=>entry.result?.items??[]).filter(item=>liveIds.has(item.id))){recent.delete(row.id);recent.set(row.id,row);}
    data.lastCreated=[...recent.values()].slice(-20).map(row=>({id:row.id,type:state.transactions.some(t=>t.id===row.id)?'transaction':state.events.some(e=>e.id===row.id)?'event':'task'}));
  }
  let name=String(title??(messageId?source.title+' · 分支':'新聊天')).trim().slice(0,40);if(!name)throw new Error('请输入聊天名称。');
  if(title===undefined){const base=name;let number=2;while(state.chatBranches.some(row=>row.title===name))name=base.slice(0,36)+' '+number++;}
  const candidate={id:newId(),title:name,createdAt:new Date().toISOString(),...(messageId?{parentId:source.id,forkMessageId:messageId}:{}),data};
  const proposed=clone(state.chatBranches);proposed.find(row=>row.id===source.id).data=capture(state,draft);proposed.push(candidate);
  if(JSON.stringify(proposed).length>4_000_000)throw new Error('聊天分支存储已较大，请先删除不需要的分支。');
  state.chatBranches.push(candidate);switchChatBranch(state,candidate.id,draft);return candidate;
}
export function renameChatBranch(state,id,title){const row=state.chatBranches.find(row=>row.id===id);if(!row)throw new Error('聊天不存在。');if(typeof title!=='string'||!title.trim()||title.length>40)throw new Error('聊天名称应为1—40字。');row.title=title.trim();}
export function deleteChatBranch(state,id,draft=''){
  if(state.chatBranches.length===1)throw new Error('至少保留一个聊天；可清空当前聊天上下文。');
  if(!state.chatBranches.some(row=>row.id===id))throw new Error('聊天不存在。');
  if(id===state.activeChatBranchId)draft=switchChatBranch(state,state.chatBranches.find(row=>row.id!==id).id,draft);
  state.chatBranches=state.chatBranches.filter(row=>row.id!==id);return draft;
}
