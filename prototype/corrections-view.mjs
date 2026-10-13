import {CORRECTION_COLLECTIONS,correctionFields} from './corrections.mjs';
const labels={amount:'金额',date:'日期',time:'时间',title:'标题',note:'备注',category:'分类',account:'账户',ledger:'账本',value:'偏好内容',evidence:'来源原话',duration:'时长',reminder:'提前提醒',repeat:'重复',until:'重复结束',exceptions:'例外日期',completed:'完成状态',calendar:'日历',notes:'备注'};
export function correctionDescription(change,{money}){
  const show=(field,value)=>value===undefined?'未设置':field==='amount'?'¥'+money(value):typeof value==='object'?JSON.stringify(value):String(value);
  if(!change.before)return '新增关联日程：'+(change.after.title??change.key);
  if(!change.after)return '移除关联记录：'+(change.before.title??change.key);
  return correctionFields(change).map(field=>(labels[field]??field)+'：'+show(field,change.before[field])+' → '+show(field,change.after[field])).join('\n');
}
export function openCorrections({state,openModal,dispatch,changed,escape,money,kind=''}){
  openModal('纠正记录','查看修改前后内容，必要时恢复旧值。',`<div id="corrections-panel"><p class="settings-note">保存最近100次纠正，包括账目、日程、待办和偏好。已保存的修改才会记录；恢复旧值时会检查后续变化。</p><div class="form-field full"><label for="correction-kind">记录类型</label><select id="correction-kind"><option value="">全部</option>${Object.entries(CORRECTION_COLLECTIONS).map(([value,label])=>`<option value="${value}" ${value===kind?'selected':''}>${label}</option>`).join('')}</select></div><div class="form-error" role="alert"></div><div data-correction-list></div><button class="btn" data-clear-corrections type="button">清空纠正记录</button></div>`);
  const panel=document.querySelector('#corrections-panel');
  const render=()=>{const result=dispatch('query_corrections',{...(panel.querySelector('select').value?{kind:panel.querySelector('select').value}:{}),limit:50});panel.querySelector('[data-correction-list]').innerHTML=result.items.length?result.items.map(row=>`<article class="correction-card"><div class="between"><b>${escape(row.label)}</b><span class="record-meta">${row.undone?'已撤销':row.revertedBy?'已恢复旧值':row.source==='ai'?'AI 修改':'手动修改'}</span></div><p class="record-meta">${escape(new Date(row.at).toLocaleString('zh-CN',{hour12:false}))}</p>${row.quote?`<p class="correction-quote">要求原话：${escape(row.quote)}</p>`:''}${row.changes.map(change=>`<div class="correction-change"><b>${escape(CORRECTION_COLLECTIONS[change.collection])} · ${escape(change.after?.note??change.after?.title??change.after?.key??change.before?.title??change.key)}</b><p>${escape(correctionDescription(change,{money}))}</p></div>`).join('')}${!row.undone&&!row.revertedBy?`<button class="btn" type="button" data-revert-correction="${escape(row.id)}">恢复修改前内容</button>`:''}</article>`).join(''):'<div class="empty">还没有纠正记录。修改已保存内容后会显示在这里。</div>';};
  render();panel.querySelector('select').addEventListener('change',render);
  panel.addEventListener('click',event=>{const button=event.target.closest('[data-revert-correction]');if(button){const result=dispatch('revert_correction',{id:button.dataset.revertCorrection});panel.querySelector('.form-error').textContent=result.ok?'':result.error;if(result.ok){changed();render();}}
    if(event.target.closest('[data-clear-corrections]')&&confirm('清空纠正记录？当前账目、日程和偏好会保留。')){state.correctionHistory=[];changed();render();}
  });
}
