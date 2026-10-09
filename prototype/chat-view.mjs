// Keep the WebView's message list and focused textarea attached during updates.
export function createChatView(panel,{messageHTML}){
  const scroller=panel.querySelector('#chat-scroll'),list=panel.querySelector('#chat-messages');
  const input=panel.querySelector('#chat-input'),send=panel.querySelector('#chat-form button[type=submit]');
  const pending=panel.querySelector('#chat-pending'),latest=panel.querySelector('[data-action=latest-messages]');
  const nodes=new Map();let initialized=false,wasVisible=false,following=true,lastTop=0,frame=0;
  const visible=()=>getComputedStyle(panel).display!=='none';
  const nearEnd=()=>scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<=72;
  const updateLatest=()=>{const hidden=following||nearEnd();if(latest.hidden!==hidden)latest.hidden=hidden;};
  function cancel(){if(frame)cancelAnimationFrame(frame);frame=0;}
  function moveToEnd(smooth=true){
    cancel();following=true;
    if(!visible())return;
    latest.hidden=true;
    if(!smooth||matchMedia('(prefers-reduced-motion:reduce)').matches){scroller.scrollTop=Math.max(0,scroller.scrollHeight-scroller.clientHeight);lastTop=scroller.scrollTop;return;}
    const from=scroller.scrollTop,start=performance.now();
    function tick(now){
      const progress=Math.max(0,Math.min(1,(now-start)/280)),target=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
      scroller.scrollTop=from+(target-from)*(1-(1-progress)**3);lastTop=scroller.scrollTop;
      if(progress<1)frame=requestAnimationFrame(tick);else{frame=0;following=true;updateLatest();}
    }
    frame=requestAnimationFrame(tick);
  }
  scroller.addEventListener('scroll',()=>{if(!visible())return;lastTop=scroller.scrollTop;if(!frame)following=nearEnd();updateLatest();},{passive:true});
  const userScroll=()=>{cancel();following=false;};
  scroller.addEventListener('wheel',userScroll,{passive:true});
  scroller.addEventListener('touchstart',userScroll,{passive:true});
  let previousHeight=scroller.clientHeight;
  const resize=new ResizeObserver(()=>{
    const height=scroller.clientHeight;if(height===previousHeight)return;previousHeight=height;
    if(visible()&&wasVisible&&following)moveToEnd(false);
  });
  resize.observe(scroller);
  return {
    moveToEnd,
    render({messages,busy,open,draft,mode,forceEnd=false}){
      const previouslyVisible=visible(),stick=following||(previouslyVisible&&nearEnd()),oldTop=previouslyVisible?scroller.scrollTop:lastTop;
      panel.classList.toggle('open',open);
      const isVisible=visible(),live=new Set(messages);let changed=false;
      for(const [message,entry]of nodes){if(!live.has(message)){entry.node.remove();nodes.delete(message);changed=true;}}
      messages.forEach((message,index)=>{
        const html=messageHTML(message);let entry=nodes.get(message);
        if(!entry){
          const node=document.createElement('div');node.className=`chat-message ${message.role}`;
          if(initialized&&isVisible)node.classList.add('is-new');
          node.addEventListener('animationend',()=>node.classList.remove('is-new'),{once:true});
          entry={node,html:null};nodes.set(message,entry);changed=true;
        }
        if(entry.html!==html){entry.node.innerHTML=html;entry.html=html;changed=true;}
        if(list.children[index]!==entry.node){list.insertBefore(entry.node,list.children[index]??null);changed=true;}
      });
      if(pending.hidden===busy){pending.hidden=!busy;changed=true;}
      if(list.getAttribute('aria-busy')!==String(busy))list.setAttribute('aria-busy',String(busy));
      if(input.value!==draft)input.value=draft;
      if(send.disabled!==busy)send.disabled=busy;
      const modeLabel=panel.querySelector('#chat-mode'),label=mode==='deepseek'?'DeepSeek':'本地演示';
      if(modeLabel.textContent!==label)modeLabel.textContent=label;
      const note=panel.querySelector('.composer-note'),caption=mode==='demo'?'本地演示 · 截图识别需要在设置中连接 API':'文字可直接操作 · 截图先核对后保存';
      if(note.textContent!==caption)note.textContent=caption;
      if(isVisible){
        if(!initialized||!wasVisible&&following)moveToEnd(false);
        else if(forceEnd||changed&&stick)moveToEnd(true);
        else if(!frame)scroller.scrollTop=oldTop;
        updateLatest();
      }
      initialized=true;wasVisible=isVisible;
    },
    dispose(){cancel();resize.disconnect();}
  };
}
