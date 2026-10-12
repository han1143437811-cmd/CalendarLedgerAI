export function openAIMemory({state, openModal, dispatch, changed, escape}) {
  openModal('AI 记忆与上下文','记住你的偏好，也能随时修改或忘记。',`
    <div id="ai-memory-panel">
      <p class="settings-note">已确认偏好保存在本机。AI 会按当前问题选取记忆，找回较早原话和操作记录；聊天超过 200 条时，保留最多 80 条精简摘录。使用远程 AI 时，选取的上下文会发送至你配置的服务。</p>
      <label class="record-row"><span class="grow">从聊天中建议偏好<span class="record-meta">自然表达的习惯先核对，采纳后才生效</span></span><input type="checkbox" data-memory-suggestions-toggle ${state.aiMemoryPolicy?.suggestions!==false?'checked':''}></label>
      <div id="ai-memory-suggestions"></div>
      <div id="ai-memory-list"></div>${state.aiSummary?`<details class="memory-summary"><summary>对话摘要 · 已压缩 ${state.aiSummary.coveredMessages} 条消息</summary><p>${escape(state.aiSummary.text)}</p><span class="record-meta">模型生成的历史资料，真实状态仍需查询。</span></details>`:''}
      <form data-memory-form><div class="form-grid">
        <div class="form-field full"><label for="ai-memory-key">记忆名称</label><input id="ai-memory-key" name="key" maxlength="60" placeholder="例如：订阅分摊规则" required></div>
        <div class="form-field full"><label for="ai-memory-value">偏好内容</label><input id="ai-memory-value" name="value" maxlength="300" placeholder="例如：月订阅默认按付款所在自然月均摊" required></div>
      </div><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">保存记忆</button></div></form>
      <p class="settings-note">也可以直接对 AI 说：“记住，我的月订阅都保留付款、按天分摊。”同名记忆会更新。</p>
      <button class="btn" type="button" data-memory-clear-chat>清空聊天上下文</button>
      <p class="settings-note">清空会一起删除旧聊天摘录，保留已确认偏好、账目和日程。当前保存最近 <span data-memory-chat-count>${Math.min(200,state.chat.length)}</span> 条消息。</p>
    </div>`);
  const panel=document.querySelector('#ai-memory-panel'), list=panel.querySelector('#ai-memory-list');
  const render=()=>{
    list.innerHTML=state.aiMemory.length?state.aiMemory.map((row,index)=>`<div class="record-row"><div class="grow"><b>${escape(row.key)}</b><div class="record-meta">${escape(row.value)}</div>${row.evidence?`<div class="record-meta">来源原话：${escape(row.evidence)}</div>`:''}</div><button class="text-button" type="button" data-memory-delete="${index}">忘记</button></div>`).join(''):'<div class="empty">还没有长期偏好，告诉 AI 你希望它记住什么。</div>';
    panel.querySelector('#ai-memory-suggestions').innerHTML=(state.aiMemorySuggestions??[]).map(row=>`<div class="memory-suggestion"><b>${escape(row.key)}</b><p>${escape(row.value)}</p><div class="record-meta">来源原话：${escape(row.evidence)}</div>${state.aiMemory.some(item=>item.key===row.key)?'<p class="settings-note">采纳后替换同名旧偏好。</p>':''}<div class="form-actions"><button class="btn" type="button" data-memory-dismiss="${escape(row.id)}">忽略</button><button class="btn primary" type="button" data-memory-accept="${escape(row.id)}">采纳偏好</button></div></div>`).join('');
  };
  render();
  panel.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.target, data=Object.fromEntries(new FormData(form));
    const result=dispatch('remember_preference',data);
    panel.querySelector('.form-error').textContent=result.ok?'':result.error;
    if(result.ok){form.reset();changed();render();}
  });
  panel.addEventListener('click',event=>{
    const suggestion=event.target.closest('[data-memory-accept],[data-memory-dismiss]');
    if(suggestion){const result=dispatch(suggestion.dataset.memoryAccept?'accept_memory_suggestion':'dismiss_memory_suggestion',{id:suggestion.dataset.memoryAccept??suggestion.dataset.memoryDismiss});panel.querySelector('.form-error').textContent=result.ok?'':result.error;changed();render();}
    const button=event.target.closest('[data-memory-delete]');
    if(button){const row=state.aiMemory[Number(button.dataset.memoryDelete)];if(row){dispatch('forget_preference',{key:row.key});changed();render();}}
    if(event.target.closest('[data-memory-clear-chat]')&&confirm('清空保存的聊天及其上下文？偏好、账目和日程会保留。')){state.chat=[];state.aiChatArchive=[];state.aiMemorySuggestions=[];state.aiSummary=null;changed();render();panel.querySelector('[data-memory-clear-chat]').textContent='聊天上下文已清空';panel.querySelector('[data-memory-chat-count]').textContent='0';}
  });
  panel.querySelector('[data-memory-suggestions-toggle]').addEventListener('change',event=>{dispatch('update_memory_policy',{suggestions:event.target.checked});changed();});
}
