export function openChatBranches({state,openModal,escape,switchBranch,newChat,rename,remove}){
  openModal('聊天与分支','保留不同方案，随时回到原聊天。',`<div id="chat-branches-panel"><p class="settings-note">每个聊天分别保存消息、摘要和文字草稿。账目、日程与已确认偏好在所有聊天中共享；复制历史不会重新执行操作。</p><div data-branch-list></div><button class="btn primary" type="button" data-branch-new>开始新聊天</button><div class="form-error" role="alert"></div></div>`);
  const panel=document.querySelector('#chat-branches-panel');
  const render=()=>{panel.querySelector('[data-branch-list]').innerHTML=state.chatBranches.map(row=>{const current=row.id===state.activeChatBranchId,source=state.chatBranches.find(item=>item.id===row.parentId);return `<article class="branch-card ${current?'active':''}"><button type="button" class="branch-open" data-branch-open="${escape(row.id)}"><b>${escape(row.title)}</b><small>${current?'当前聊天 · ':''}${row.parentId?'分支 · 来自 '+escape(source?.title??'已删除聊天'):'独立聊天'} · ${current?state.chat.length:row.data.chat.length} 条消息</small></button><div class="branch-actions"><button class="text-button" type="button" data-branch-rename="${escape(row.id)}">重命名</button><button class="text-button" type="button" data-branch-remove="${escape(row.id)}" ${state.chatBranches.length===1?'disabled':''}>删除聊天</button></div></article>`;}).join('');};render();
  panel.addEventListener('click',event=>{try{const button=event.target.closest('button');if(!button)return;if(button.dataset.branchOpen)switchBranch(button.dataset.branchOpen);
    if(button.hasAttribute('data-branch-new'))newChat();
    if(button.dataset.branchRename){const row=state.chatBranches.find(item=>item.id===button.dataset.branchRename),title=prompt('聊天名称',row.title);if(title!==null){rename(row.id,title);render();}}
    if(button.dataset.branchRemove&&confirm('删除这个聊天及其上下文？账目、日程和偏好会保留。')){remove(button.dataset.branchRemove);render();}
  }catch(error){panel.querySelector('.form-error').textContent=error.message;}});
}
