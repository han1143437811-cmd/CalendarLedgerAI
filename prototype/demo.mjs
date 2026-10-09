import {dispatch,todayISO,addDays,parseDate,isoDate,monthKey,monthBounds,money,searchTransactions} from './core.mjs';
const cnNumber = s => ({一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10}[s]??Number(s));
export function resolveDate(message,now=todayISO()) {
  const exact=message.match(/\d{4}-\d{2}-\d{2}/);if(exact)return exact[0];
  if(message.includes('大后天'))return addDays(now,3);if(message.includes('后天'))return addDays(now,2);if(message.includes('明天'))return addDays(now,1);if(message.includes('前天'))return addDays(now,-2);if(message.includes('昨天'))return addDays(now,-1);
  const week=message.match(/(下周|本周|周)([一二三四五六日天])/);if(week){const day=parseDate(now).getDay()||7, target={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7}[week[2]];let diff=target-day;if(week[1]==='下周')diff+=7;else if(week[1]==='周'&&diff<0)diff+=7;return addDays(now,diff);}
  const monthDay=message.match(/(\d{1,2})月(\d{1,2})[日号]/);if(monthDay)return `${now.slice(0,4)}-${monthDay[1].padStart(2,'0')}-${monthDay[2].padStart(2,'0')}`;
  return now;
}
export function resolveTime(message,fallback='14:00') {
  const match=message.match(/(上午|下午|晚上|早上|中午)?\s*([\d一二三四五六七八九十两]{1,2})(?:点|时)(半|[\d一二三四五六七八九十]{1,2}分?)?/);
  if(!match)return fallback;let hour=cnNumber(match[2]);const minute=match[3]==='半'?30:match[3]?cnNumber(match[3].replace('分','')):0;if(['下午','晚上'].includes(match[1])&&hour<12)hour+=12;if(match[1]==='中午'&&hour<11)hour+=12;
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
const itemName=r=>r.note??r.title??'记录';
function resolveTarget(state,list,keyword,type) {
  const meaningful=keyword.replace(/今天|昨天|前天|明天|刚才|上一笔|那笔|这笔|那个|这次|的|把|将|只/g,'').trim();
  const recent=state.lastCreated.filter(x=>x.type===type).map(x=>list.find(t=>t.id===x.id)).filter(Boolean);
  let items=recent.filter(r=>!meaningful||itemName(r).includes(meaningful)||meaningful.includes(itemName(r)));
  if(!items.length)items=list.filter(r=>itemName(r).includes(meaningful)||meaningful.includes(itemName(r)));
  if(keyword.includes('昨天'))items=items.filter(x=>x.date===addDays(todayISO(),-1));
  if(items.length!==1)return{ok:false,error:items.length?`找到 ${items.length} 条相似记录，请点击具体账目或日程修改。`:'没有找到对应记录。可以先在明细中选择一条，再修改。',candidates:items.slice(0,5)};
  return{ok:true,item:items[0]};
}
export function runDemo(state,message,now=todayISO()) {
  const results=[],notes=[],createdRefs=[];let lastTransaction=null;const run=(name,args)=>{const result=dispatch(state,name,args,{today:now});results.push({name,result});if(result.ok&&result.type==='transaction')lastTransaction=result.items[0];if(result.ok&&['create_transactions','create_event','create_task','schedule_in_free_slots'].includes(name))createdRefs.push(...result.items.map(x=>({id:x.id,type:result.type,note:x.note,title:x.title})));return result;};
  const clauses=message.replace(/[，；;。]/g,',').split(',').map(x=>x.trim()).filter(Boolean),segments=[];
  for(const clause of clauses){if(segments.length&&(/^(提前.*提醒|排除|与上月|和上月|比上月|对比上月)/.test(clause)))segments[segments.length-1]+=' '+clause;else segments.push(clause);}
  for(const segment of segments){
    if(/^备注/.test(segment)){if(lastTransaction)run('update_transaction',{id:lastTransaction.id,note:segment.replace(/^备注(?:为|成)?/,'').trim()});else notes.push('请先明确要修改备注的账目。');continue;}
    if(/撤销/.test(segment)){const keyword=segment.replace(/撤销|刚才|那笔|这笔|的|账目/g,'').trim();if(keyword&&keyword!=='操作'){const target=resolveTarget(state,state.transactions,keyword,'transaction');if(target.ok)run('delete_transactions',{ids:[target.item.id]});else results.push({name:'resolve',result:target});}else run('undo_operation',{});continue;}
    if(/(会议|日程).*(推迟|提前)/.test(segment)){const target=resolveTarget(state,state.events,segment.match(/(会议|日程)/)[0]==='会议'?'讨论':'','event');if(!target.ok){results.push({name:'resolve',result:target});continue;}const amount=cnNumber(segment.match(/([\d一二三两]+)小时/)?.[1]??'1')*60;const [h,m]=target.item.time.split(':').map(Number);const total=h*60+m+(segment.includes('推迟')?amount:-amount);run('update_event',{id:target.item.id,time:`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`,scope:target.item.repeat==='none'?'series':undefined});continue;}
    if(/(会议|日程).*(改到|改成|改为)/.test(segment)){const target=resolveTarget(state,state.events,'','event');if(target.ok)run('update_event',{id:target.item.id,time:resolveTime(segment),date:/明天|后天|周[一二三四五六日]/.test(segment)?resolveDate(segment,now):target.item.date,scope:target.item.repeat==='none'?'series':undefined});else results.push({name:'resolve',result:target});continue;}
    const edit=segment.match(/(.+?)(?:改成|改为|修改为)\s*(\d+(?:\.\d{1,2})?)/);if(edit&&!/预算/.test(segment)){const target=resolveTarget(state,state.transactions,edit[1],'transaction');if(target.ok)run('update_transaction',{id:target.item.id,amount:Number(edit[2])});else results.push({name:'resolve',result:target});continue;}
    if(/预算|上限/.test(segment)){const amount=segment.match(/\d+(?:\.\d{1,2})?/)?.[0];if(amount)run('set_budget',{category:segment.includes('餐饮')?'餐饮':'全部',amount:Number(amount)});else notes.push('请告诉我预算金额，例如“餐饮预算800”。');continue;}
    if(/安排/.test(segment)&&/下周|找.*空|三次|3次/.test(segment)){let start=resolveDate(segment,now);if(segment.includes('下周'))start=addDays(now,8-(parseDate(now).getDay()||7));const count=cnNumber(segment.match(/([\d一二三四五两])次/)?.[1]??'三');const duration=cnNumber(segment.match(/([\d一二三四两])小时/)?.[1]??'两')*60;run('schedule_in_free_slots',{title:segment.includes('论文')?'论文写作':'专注时间',start,end:addDays(start,4),count,duration,buffer:30,from:'13:00',to:'18:00',workdays:true});continue;}
    if(/开会|会议|项目讨论|日程|健身|聚餐|安排/.test(segment)&&/点|安排|日程/.test(segment)){const durationMatch=segment.match(/([\d一二三四两])(?:个)?小时/);const reminderMatch=segment.match(/提前\s*([\d一二三四五六七八九十两]+)\s*分钟/);run('create_event',{title:/开会|会议|讨论/.test(segment)?'项目讨论':segment.includes('健身')?'健身':segment.includes('聚餐')?'聚餐':'专注时间',date:resolveDate(segment,now),time:resolveTime(segment),duration:durationMatch?cnNumber(durationMatch[1])*60:60,reminder:reminderMatch?cnNumber(reminderMatch[1]):segment.includes('提前半小时')?30:state.settings.defaultReminder,calendar:/项目|论文|会议|开会/.test(segment)?'work':'personal',repeat:segment.includes('每周')?'weekly':'none'});continue;}
    if(/待办|整理.*材料|检查.*文献/.test(segment)){if(/完成/.test(segment)){const items=state.tasks.filter(t=>t.title.includes(segment.includes('报销')?'报销':segment.replace(/待办|标记|完成|将|把|为/g,'')));if(items.length===1)run('update_task',{id:items[0].id,completed:!segment.includes('未完成')});else notes.push('请在待办列表选择要修改的项目。');}else{const title=segment.replace(/添加|新增|一个|待办[:：]?|周[一二三四五六日]前|明天|今天/g,'').trim()||'整理报销材料';run('create_task',{title,date:resolveDate(segment,now)});}continue;}
    if(/主题|深色|浅色|字体|24小时|周一开始|周日开始|默认.*提醒/.test(segment)){const args={};if(/深色|暗色/.test(segment))args.theme='dark';if(/浅色/.test(segment))args.theme='light';if(/字体.*大/.test(segment))args.fontSize='large';if(/字体.*正常/.test(segment))args.fontSize='normal';if(/24小时/.test(segment))args.hour24=true;if(/周一开始/.test(segment))args.weekStart=1;if(/周日开始/.test(segment))args.weekStart=0;const n=segment.match(/提前(\d+)分钟/);if(n)args.defaultReminder=Number(n[1]);run('update_settings',args);continue;}
    if(/节假日|调休|放假/.test(segment)){run('get_holidays',monthBounds(state.viewMonth));continue;}
    if(/备份/.test(segment)){run('export_backup',{});continue;}
    if(/导出/.test(segment)){run('export_csv',monthBounds(state.viewMonth));continue;}
    if(/API|设置/.test(segment)){run('open_settings',{});continue;}
    if(/新建.*账本|建一个.*账本/.test(segment)){run('create_ledger',{name:segment.match(/(?:新建|建一个)(.*?)账本/)?.[1]+'账本'});continue;}
    if(/打开|切换|只看|显示/.test(segment)){let page=segment.includes('分析')?'reports':segment.includes('明细')||segment.includes('账本')?'ledger':segment.includes('待办')?'tasks':'calendar';const args={page};if(/明天|昨天|今天/.test(segment))args.date=resolveDate(segment,now);if(segment.includes('周视图'))args.view='week';if(segment.includes('日视图'))args.view='day';if(segment.includes('月视图'))args.view='month';if(segment.includes('只看日程'))args.filter='events';if(segment.includes('只看账'))args.filter='transactions';if(segment.includes('餐饮'))args.category='餐饮';run('navigate_calendar',args);continue;}
    if(/分析|花在哪|花了多少|收支|对比|比较|统计|支出/.test(segment)&&!/(午饭|地铁|早餐|咖啡)\s*\d/.test(segment)){const args={...monthBounds(monthKey(now)),end:now};if(segment.includes('上月')&&!/比|对比/.test(segment)){const d=parseDate(now);d.setMonth(d.getMonth()-1,1);Object.assign(args,monthBounds(monthKey(isoDate(d))));}if(segment.includes('餐饮'))args.category='餐饮';if(segment.includes('交通'))args.category='交通';if(/排除.*报销/.test(segment))args.excludeCategories=['报销'];if(/排除.*旅行/.test(segment))args.excludeLedgers=['旅行账本'];if(/上月同期|对比|比上月/.test(segment))run('compare_cashflow',args);else run('query_cashflow',args);continue;}
    const match=segment.match(/(午饭|午餐|晚饭|晚餐|早餐|咖啡|奶茶|地铁|公交|打车|购物|房租|工资|报销|退款|电影|电子书|生活用品|转账)\s*(\d+(?:\.\d{1,2})?)/);
    if(match){const note=match[1],category=/饭|餐|咖啡|奶茶/.test(note)?'餐饮':/地铁|公交|打车/.test(note)?'交通':/工资|报销|退款|转账/.test(note)?note:note==='房租'?'居住':note==='电影'?'娱乐':note==='电子书'?'学习':'购物';run('create_transactions',{items:[{date:resolveDate(segment,now),note,category,amount:Number(match[2]),kind:/工资|报销/.test(note)?'income':note==='退款'?'refund':note==='转账'?'transfer':'expense',account:segment.includes('现金')?'现金':segment.includes('银行卡')?'银行卡':'微信'}]});continue;}
    notes.push(`演示指令暂未识别“${segment}”。可以试试下方示例，或在设置中接入 DeepSeek 使用自由表达。`);
  }
  if(createdRefs.length)state.lastCreated=createdRefs;return{results,notes};
}
export function describeResult(result) {
  if(!result.ok)return result.error;
  if(result.type==='transaction')return result.items.length>1?`已处理 ${result.items.length} 笔账目。`:`已保存“${result.items[0].note}”，¥${money(result.items[0].amount)}。`;
  if(result.type==='event')return`已保存 ${result.items.length} 个日程。提醒设置已记录；手机端可在设置中启用通知，示例数据不触发通知。`;
  if(result.type==='task')return'待办已经更新。';if(result.type==='deleted')return'已移除选定记录，可撤销。';if(result.type==='undo')return`已撤销：${result.label}。`;
  if(result.type==='analysis') {const top=result.byCategory.filter(x=>x.amount>0)[0];return`${result.start} 至 ${result.end}，已记录收入 ¥${money(result.income)}，支出 ¥${money(result.expense)}。${top?`支出最高的是${top.name}，¥${money(top.amount)}。`:''}`;}
  if(result.type==='comparison'){const change=result.changes.find(x=>x.delta>0);return`本期支出 ¥${money(result.current.expense)}，上月同期 ¥${money(result.previous.expense)}，${result.delta>=0?'增加':'减少'} ¥${money(Math.abs(result.delta))}。${change?`${change.name}增加 ¥${money(change.delta)}，可打开明细核查。`:'当前账目未显示支出增加。'}`;}
  if(result.type==='holidays')return result.items.length?result.items.map(d=>`${d.date} ${d.name}：${d.isOffDay?'放假':'调休上班'}`).join('\n'):'该范围没有已公布的节假日条目，请查看年份和更新状态。';if(result.type==='holidays_updated')return result.announced?`已获取 ${result.year} 年 ${result.count} 个放假/补班日期。${result.warning?'联网更新失败，目前使用缓存。':''}`:`${result.year} 年安排尚未公布。`;
  if(result.type==='budget')return`已将${result.category==='全部'?'总':result.category}预算设为 ¥${money(result.amount)}。`;if(result.type==='settings')return'设置已更新，页面已同步变化。';if(result.type==='navigation')return'已打开对应页面。';if(result.type==='download')return'文件已生成，浏览器将开始下载。';if(result.type==='ledger')return`已创建“${result.name}”。`;if(result.type==='calendar')return'日历已更新。';if(result.type==='open_settings')return'已打开设置，可填写你的 API 配置。';return'操作完成。';
}
