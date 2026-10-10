export const STORAGE_KEY = 'calendar-ledger-ai-v01';
export const CATEGORY_COLORS = { '餐饮': '#b59079', '交通': '#879eae', '购物': '#aa9bae', '居住': '#b7a17e', '娱乐': '#ba9398', '学习': '#8aa397', '医疗': '#8fa7ac', '其他': '#9ca5a0', '工资': '#7f9b86', '报销': '#98ad9f', '退款': '#8fa791', '转账': '#9ca5a0' };
export const uid = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => isoDate(new Date());
export const parseDate = s => new Date(`${s}T12:00:00`);
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const monthKey = s => s.slice(0, 7);
export const monthBounds = month => { const [y,m] = month.split('-').map(Number); return { start: `${month}-01`, end: isoDate(new Date(y,m,0,12)) }; };
export const changeMonth = (month, delta) => { const [y,m] = month.split('-').map(Number); return monthKey(isoDate(new Date(y,m-1+delta,1,12))); };
export const money = cents => (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function toCents(value) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(String(value))) throw new Error('金额需要是大于零、最多两位小数的数字。');
  const [a,b=''] = String(value).split('.'); const cents = Number(a)*100 + Number(b.padEnd(2,'0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1e11) throw new Error('金额超出允许范围。');
  return cents;
}
export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || isoDate(parseDate(s)) !== s) throw new Error('请提供有效日期，格式为 YYYY-MM-DD。');
  return s;
}
const text = (s,label,max=160) => { if (typeof s !== 'string' || !s.trim() || s.length > max) throw new Error(`${label}不能为空，且不能超过 ${max} 个字。`); return s.trim(); };
const validID = s => { if(typeof s!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(s))throw new Error('记录 ID 格式无效。');return s; };
const enumValue = (v,values,label) => { if (!values.includes(v)) throw new Error(`${label}不在支持范围内。`); return v; };
const minutes = time => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? '')) throw new Error('时间格式应为 HH:MM。'); const [h,m] = time.split(':').map(Number); return h*60+m; };
const timeText = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const clone = value => JSON.parse(JSON.stringify(value));
const businessKeys = ['transactions','events','tasks','budgets','settings','calendars','ledgers','dataMode'];
function snapshot(state) { return Object.fromEntries(businessKeys.map(k=>[k,clone(state[k])])); }
function commit(state,label,action) {
  const before = snapshot(state); const operationId=uid('op');
  try { const result=action(); state.undo.push({id:operationId,label,before}); if(state.undo.length>30)state.undo.shift(); return {ok:true,operationId,...result}; }
  catch(error) { for(const key of businessKeys)state[key]=before[key]; throw error; }
}

export function createInitialState(now=todayISO(),demo=true) {
  validDate(now); const month=monthKey(now), previous=changeMonth(month,-1); const day=Number(now.slice(-2));
  const state={version:1,dataMode:demo?'demo':'personal',transactions:[],events:[],tasks:[],budgets:{'全部':5000*100,'餐饮':800*100},settings:{theme:'light',weekStart:1,fontSize:'normal',defaultReminder:30,hour24:true},calendars:[{id:'personal',name:'个人日历',color:'#6882d8'},{id:'work',name:'工作日历',color:'#6ba695'}],ledgers:['个人账本','旅行账本'],undo:[],page:'calendar',viewMonth:month,selectedDate:now,calendarView:'month',contentFilter:'all',ledgerFilter:'all',categoryFilter:'all',search:'',chat:[],lastCreated:[]};
  if(!demo)return state;
  const tx=(date,kind,amount,category,note,account='微信',ledger='个人账本')=>state.transactions.push({id:uid('tx'),date,kind,amount:toCents(amount),category,note,account,ledger});
  tx(`${month}-01`,'income',9800,'工资','本月工资','银行卡');
  const fixtures=[['餐饮','早餐',12],['交通','地铁',6],['餐饮','午饭',32],['购物','生活用品',86],['餐饮','咖啡',22],['学习','电子书',49],['娱乐','电影',45],['交通','打车',28]];
  for(let i=1;i<=day;i++) { const d=`${month}-${String(i).padStart(2,'0')}`; const a=fixtures[(i-1)%fixtures.length], b=fixtures[(i+1)%fixtures.length]; tx(d,'expense',a[2],a[0],a[1]); tx(d,'expense',b[2],b[0],b[1]); }
  tx(`${month}-01`,'expense',1800,'居住','房租','银行卡');
  if(day>=3)tx(`${month}-03`,'income',260,'报销','项目交通报销','银行卡');
  for(let i=1;i<=28;i++){const a=fixtures[(i+2)%fixtures.length];tx(`${previous}-${String(i).padStart(2,'0')}`,'expense',a[2]+5,a[0],a[1]);}
  tx(`${previous}-01`,'income',9800,'工资','上月工资','银行卡');tx(`${previous}-01`,'expense',1800,'居住','上月房租','银行卡');
  const event=(date,title,time,duration,calendar='personal',repeat='none')=>state.events.push({id:uid('ev'),date,title,time,duration,calendar,repeat,until:'',exceptions:[],reminder:30,notes:''});
  event(now,'读书与整理','09:00',60);event(addDays(now,1),'项目讨论','14:00',60,'work');event(addDays(now,2),'论文写作','10:00',120,'work');event(addDays(now,4),'健身','19:00',60,'personal','weekly');event(addDays(now,7),'周末采购','10:30',60);event(addDays(now,10),'朋友聚餐','18:30',90);event(addDays(now,12),'阶段汇报','15:00',90,'work');
  state.tasks=[{id:uid('task'),title:'整理本周报销材料',date:addDays(now,2),completed:false},{id:uid('task'),title:'检查论文参考文献',date:addDays(now,4),completed:false},{id:uid('task'),title:'导出上月账单',date:now,completed:true}];
  return state;
}

export function validateTransaction(input) {
  const kind=enumValue(input.kind??'expense',['expense','income','transfer','refund'],'收支类型');
  return {id:input.id?validID(input.id):uid('tx'),date:validDate(input.date??todayISO()),kind,amount:toCents(input.amount),category:text(input.category??(kind==='income'?'其他':kind==='refund'?'退款':kind==='transfer'?'转账':'其他'),'分类',30),note:text(input.note??'未命名账目','备注',300),account:text(input.account??'微信','账户',40),ledger:text(input.ledger??'个人账本','账本',40)};
}
export function validateEvent(input,state) {
  const date=validDate(input.date??todayISO()), time=input.time??'09:00'; minutes(time);
  const duration=Number(input.duration??60),reminder=Number(input.reminder??state.settings.defaultReminder);
  if(!Number.isInteger(duration)||duration<5||duration>1440)throw new Error('日程时长应为 5—1440 分钟。');
  if(minutes(time)+duration>1440)throw new Error('这一版请将跨天日程拆成两条。');
  if(!Number.isInteger(reminder)||reminder<0||reminder>10080)throw new Error('提醒提前时间应为 0—10080 分钟。');
  const calendar=input.calendar??'personal';if(!state.calendars.some(c=>c.id===calendar))throw new Error('目标日历不存在。');
  const repeat=enumValue(input.repeat??'none',['none','daily','weekly','monthly'],'重复规则');
  const until=input.until??'';if(until){validDate(until);if(until<date)throw new Error('重复结束日期不能早于开始日期。');}
  return {id:input.id?validID(input.id):uid('ev'),date,time,duration,reminder,title:text(input.title,'日程标题'),notes:String(input.notes??'').slice(0,1000),calendar,repeat,until,exceptions:Array.isArray(input.exceptions)?input.exceptions.map(validDate):[]};
}
export function occursOn(event,date) {
  if(date<event.date || (event.until&&date>event.until) || event.exceptions?.includes(date))return false;
  if(event.repeat==='none')return date===event.date;
  const diff=Math.round((Date.parse(`${date}T00:00:00Z`)-Date.parse(`${event.date}T00:00:00Z`))/86400000);
  if(event.repeat==='daily')return true;if(event.repeat==='weekly')return diff%7===0;
  return event.repeat==='monthly'&&date.slice(-2)===event.date.slice(-2);
}
export function eventsOn(state,date) { return state.events.filter(e=>occursOn(e,date)).map(e=>({...e,occurrenceDate:date})).sort((a,b)=>a.time.localeCompare(b.time)); }
export function isWorkingDay(state,date){const entry=state.holidayDays?.[date];return entry?!entry.isOffDay:![0,6].includes(parseDate(date).getDay());}
export function searchTransactions(state,args={}) {
  if(args.start)validDate(args.start);if(args.end)validDate(args.end);
  return state.transactions.filter(t=>(!args.start||t.date>=args.start)&&(!args.end||t.date<=args.end)&&(!args.category||t.category===args.category)&&(!args.ledger||t.ledger===args.ledger)&&(!args.account||t.account===args.account)&&(!args.kind||t.kind===args.kind)&&(!args.query||`${t.note} ${t.category} ${t.account}`.includes(args.query))&&(!args.excludeCategories?.includes(t.category))&&(!args.excludeLedgers?.includes(t.ledger))&&(!args.excludeAccounts?.includes(t.account))).sort((a,b)=>b.date.localeCompare(a.date));
}
export function cashflow(state,args={}) {
  const range=monthBounds(args.month??state.viewMonth);const filters={...args,start:args.start??range.start,end:args.end??range.end};
  if(filters.start>filters.end)throw new Error('起始日期不能晚于结束日期。');
  const items=searchTransactions(state,filters);let income=0,expense=0,refund=0;const byCategory=Object.create(null),daily=Object.create(null);
  for(const t of items) { daily[t.date]??={income:0,expense:0}; if(t.kind==='income'){income+=t.amount;daily[t.date].income+=t.amount;}if(t.kind==='expense'||t.kind==='refund'){const signed=t.kind==='refund'?-t.amount:t.amount;expense+=signed;if(t.kind==='refund')refund+=t.amount;byCategory[t.category]=(byCategory[t.category]??0)+signed;daily[t.date].expense+=signed;} }
  return {start:filters.start,end:filters.end,income,expense,refund,net:income-expense,count:items.length,expenseCount:items.filter(t=>t.kind==='expense').length,byCategory:Object.entries(byCategory).map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount),daily,recordIds:items.map(t=>t.id),filters,definition:'人民币；内部转账不计收入/支出；退款抵减支出；仅统计已记录账目。'};
}
export function compareCashflow(state,args={}) {
  const now=args.today??todayISO(); const current=cashflow(state,{...args,start:args.start??`${monthKey(now)}-01`,end:args.end??now});
  if(monthKey(current.start)!==monthKey(current.end))throw new Error('上月同期对比请使用同一个月内的范围；跨月趋势可分别查询各月收支。');
  const previousMonth=changeMonth(monthKey(current.start),-1), last=Number(monthBounds(previousMonth).end.slice(-2));
  const previous=cashflow(state,{...args,start:`${previousMonth}-${String(Math.min(Number(current.start.slice(-2)),last)).padStart(2,'0')}`,end:`${previousMonth}-${String(Math.min(Number(current.end.slice(-2)),last)).padStart(2,'0')}`});
  const categoryNames=new Set([...current.byCategory,...previous.byCategory].map(x=>x.name));
  const changes=[...categoryNames].map(name=>({name,current:current.byCategory.find(x=>x.name===name)?.amount??0,previous:previous.byCategory.find(x=>x.name===name)?.amount??0})).map(x=>({...x,delta:x.current-x.previous})).sort((a,b)=>b.delta-a.delta);
  return {current,previous,delta:current.expense-previous.expense,changes};
}
export function findFreeSlots(state,args={}) {
  const start=validDate(args.start??addDays(todayISO(),1)),end=validDate(args.end??addDays(start,13));
  const duration=Number(args.duration??120),count=Number(args.count??3),buffer=Number(args.buffer??30);const from=minutes(args.from??'13:00'),to=minutes(args.to??'18:00');
  if(!Number.isInteger(duration)||duration<5||duration>720||!Number.isInteger(count)||count<1||count>20||!Number.isInteger(buffer)||buffer<0||buffer>120||to<=from||duration>to-from)throw new Error('排程时长、次数、缓冲或时间范围不合理。');
  if(end<start||end>addDays(start,60))throw new Error('请将排程范围限制在 60 天以内。');
  const slots=[];
  for(let date=start;date<=end&&slots.length<count;date=addDays(date,1)) {
    if(args.workdays!==false&&!isWorkingDay(state,date))continue;
    const busy=eventsOn(state,date).map(e=>({start:minutes(e.time)-buffer,end:minutes(e.time)+e.duration+buffer}));
    for(let m=from;m+duration<=to;m+=30){if(!busy.some(b=>m<b.end&&m+duration>b.start)){slots.push({date,time:timeText(m),duration});busy.push({start:m-buffer,end:m+duration+buffer});if(slots.length>=count||args.onePerDay!==false)break;}}
  }
  const years=[...new Set([start.slice(0,4),end.slice(0,4)])],known=years.every(y=>state.holidayMeta?.[y]?.papers?.length);return {slots,requested:count,complete:slots.length===count,criteria:{start,end,duration,count,buffer,from:timeText(from),to:timeText(to),workdays:args.workdays!==false,workdayBasis:known?'中国放假调休安排':'仅周一至周五；部分年份调休数据未获取'}};
}
function pick(object,keys){return Object.fromEntries(keys.filter(k=>Object.hasOwn(object,k)).map(k=>[k,object[k]]));}
function requireRecord(list,id){const record=list.find(t=>t.id===id);if(!record)throw new Error('找不到这条记录，请先查询并选择正确的 ID。');return record;}
function editEvent(state,args,deleting=false) {
  const original=requireRecord(state.events,args.id);const occurrence=args.occurrenceDate??original.date;
  if(original.repeat!=='none'&&!args.scope)throw new Error('请指定只改本次、此后日程或整个重复系列。');
  let scope=args.scope??'series';enumValue(scope,['occurrence','future','series'],'修改范围');validDate(occurrence);if(scope==='future'&&occurrence===original.date)scope='series';
  if(!occursOn(original,occurrence))throw new Error('该日期不是这个日程的一次有效发生。');
  const changes=pick(args,['title','date','time','duration','reminder','calendar','repeat','until','notes']);
  if(scope==='series'||original.repeat==='none') { if(deleting){state.events=state.events.filter(e=>e.id!==original.id);return {deletedIds:[original.id]};}const updated=validateEvent({...original,...changes},state);Object.assign(original,updated);return {items:[updated]}; }
  if(scope==='occurrence') { original.exceptions.push(occurrence);if(deleting)return{deletedIds:[original.id],occurrenceDate:occurrence};const updated=validateEvent({...original,...changes,id:uid('ev'),date:changes.date??occurrence,repeat:'none',until:'',exceptions:[]},state);state.events.push(updated);return{items:[updated]}; }
  const previousUntil=original.until;original.until=addDays(occurrence,-1);if(deleting)return{deletedIds:[original.id],from:occurrence};const updated=validateEvent({...original,...changes,id:uid('ev'),date:changes.date??occurrence,until:changes.until??previousUntil,exceptions:original.exceptions.filter(d=>d>=occurrence)},state);state.events.push(updated);return{items:[updated]};
}

export function dispatch(state,name,args={},context={}) {
  const now=context.today??todayISO();
  try {
    switch(name){
      case 'get_app_context':return{ok:true,today:now,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,selectedDate:state.selectedDate,viewMonth:state.viewMonth,dataMode:state.dataMode,calendars:clone(state.calendars),ledgers:state.ledgers,lastCreated:clone(state.lastCreated),settings:clone(state.settings),currency:'CNY',holidays:state.holidayMeta??{},reminders:context.isAndroid?(context.reminderStatus??'手机提醒需在设置中授权；示例账本不触发通知。'):'浏览器版只保存提醒参数，不发送系统通知。'};
      case 'get_holidays':{const range=monthBounds(args.month??state.viewMonth);return{ok:true,type:'holidays',items:Object.values(state.holidayDays??{}).filter(d=>d.date>=(args.start??range.start)&&d.date<=(args.end??range.end)),metadata:state.holidayMeta??{}};}
      case 'search_transactions':return{ok:true,items:clone(searchTransactions(state,args))};
      case 'create_transactions':return commit(state,'新增账目',()=>{if(!Array.isArray(args.items)||args.items.length<1||args.items.length>50)throw new Error('一次需要提供 1—50 条账目。');const items=args.items.map(t=>validateTransaction({...t,date:t.date??now,id:uid('tx')}));state.transactions.push(...items);state.lastCreated=items.map(t=>({id:t.id,note:t.note,type:'transaction'}));return{type:'transaction',items};});
      case 'update_transaction':return commit(state,'修改账目',()=>{const old=requireRecord(state.transactions,args.id);const changes=pick(args,['date','kind','amount','category','note','account','ledger']);const item=validateTransaction({...old,amount:old.amount/100,...changes});Object.assign(old,item);return{type:'transaction',items:[item]};});
      case 'delete_transactions':return commit(state,'删除账目',()=>{if(!Array.isArray(args.ids)||args.ids.length<1)throw new Error('需要明确选择账目 ID。');for(const id of args.ids)requireRecord(state.transactions,id);state.transactions=state.transactions.filter(t=>!args.ids.includes(t.id));return{type:'deleted',deletedIds:args.ids};});
      case 'query_cashflow':return{ok:true,type:'analysis',...cashflow(state,args)};
      case 'compare_cashflow':return{ok:true,type:'comparison',...compareCashflow(state,{...args,today:now})};
      case 'set_budget':return commit(state,'设置预算',()=>{const category=text(args.category??'全部','预算分类',30);if(['__proto__','constructor','prototype'].includes(category))throw new Error('该预算分类名称不允许使用。');state.budgets[category]=toCents(args.amount);return{type:'budget',category,amount:state.budgets[category]};});
      case 'search_events':{if(args.start)validDate(args.start);if(args.end)validDate(args.end);return{ok:true,type:'event',items:clone(state.events.filter(e=>(!args.query||e.title.includes(args.query))&&(!args.calendar||e.calendar===args.calendar)&&(!args.end||e.date<=args.end)&&(!args.start||e.repeat!=='none'||e.date>=args.start)))};}
      case 'create_event':return commit(state,'新增日程',()=>{const item=validateEvent({...args,date:args.date??now,id:uid('ev')},state);state.events.push(item);state.lastCreated=[...state.lastCreated.filter(x=>x.type!=='event'),{id:item.id,title:item.title,type:'event'}];return{type:'event',items:[item]};});
      case 'update_event':return commit(state,'修改日程',()=>({type:'event',...editEvent(state,args)}));
      case 'delete_event':return commit(state,'删除日程',()=>({type:'deleted',...editEvent(state,args,true)}));
      case 'find_free_slots':return{ok:true,type:'slots',...findFreeSlots(state,args)};
      case 'schedule_in_free_slots':return commit(state,'安排日程',()=>{const plan=findFreeSlots(state,args);if(!plan.complete)throw new Error(`找到 ${plan.slots.length} 个空档，未达到要求的 ${plan.requested} 个；未创建日程，请调整条件。`);const items=plan.slots.map(s=>validateEvent({...s,title:args.title,calendar:args.calendar??'work',reminder:args.reminder??state.settings.defaultReminder},state));state.events.push(...items);state.lastCreated=items.map(e=>({id:e.id,title:e.title,type:'event'}));return{type:'event',items,criteria:plan.criteria};});
      case 'search_tasks':return{ok:true,type:'task',items:clone(state.tasks.filter(t=>(!args.query||t.title.includes(args.query))&&(args.completed===undefined||t.completed===args.completed)))};
      case 'create_task':return commit(state,'新增待办',()=>{const item={id:uid('task'),title:text(args.title,'待办标题'),date:validDate(args.date??now),completed:false};state.tasks.push(item);return{type:'task',items:[item]};});
      case 'update_task':return commit(state,'修改待办',()=>{const item=requireRecord(state.tasks,args.id);if(args.title!==undefined)item.title=text(args.title,'待办标题');if(args.date!==undefined)item.date=validDate(args.date);if(args.completed!==undefined){if(typeof args.completed!=='boolean')throw new Error('完成状态应为 true 或 false。');item.completed=args.completed;}return{type:'task',items:[clone(item)]};});
      case 'delete_task':return commit(state,'删除待办',()=>{requireRecord(state.tasks,args.id);state.tasks=state.tasks.filter(t=>t.id!==args.id);return{type:'deleted',deletedIds:[args.id]};});
      case 'navigate_calendar':{if(args.page)state.page=enumValue(args.page,['calendar','ledger','reports','tasks'],'页面');if(args.date){state.selectedDate=validDate(args.date);state.viewMonth=monthKey(args.date);}if(args.view)state.calendarView=enumValue(args.view,['month','week','day'],'视图');if(args.filter)state.contentFilter=enumValue(args.filter,['all','events','transactions'],'显示内容');if(args.category!==undefined)state.categoryFilter=args.category||'all';if(args.ledger!==undefined)state.ledgerFilter=args.ledger||'all';return{ok:true,type:'navigation',page:state.page,date:state.selectedDate,view:state.calendarView};}
      case 'get_settings':return{ok:true,settings:clone(state.settings),budgets:clone(state.budgets)};
      case 'update_settings':return commit(state,'修改设置',()=>{const settings=pick(args,['theme','weekStart','fontSize','defaultReminder','hour24']);if(settings.theme!==undefined)enumValue(settings.theme,['light','dark'],'主题');if(settings.weekStart!==undefined)enumValue(settings.weekStart,[0,1],'周起始日');if(settings.fontSize!==undefined)enumValue(settings.fontSize,['normal','large'],'字体');if(settings.defaultReminder!==undefined&&(!Number.isInteger(settings.defaultReminder)||settings.defaultReminder<0||settings.defaultReminder>10080))throw new Error('默认提醒时间无效。');if(settings.hour24!==undefined&&typeof settings.hour24!=='boolean')throw new Error('24小时制选项无效。');Object.assign(state.settings,settings);return{type:'settings',settings:clone(state.settings)};});
      case 'manage_calendar':return commit(state,'管理日历',()=>{const action=enumValue(args.action,['create','update'],'日历操作');if(action==='create'){const item={id:uid('cal'),name:text(args.name,'日历名称',40),color:/^#[\da-f]{6}$/i.test(args.color??'')?args.color:'#6882d8'};state.calendars.push(item);return{type:'calendar',items:[item]};}const item=requireRecord(state.calendars,args.id);if(args.name)item.name=text(args.name,'日历名称',40);if(args.color){if(!/^#[\da-f]{6}$/i.test(args.color))throw new Error('颜色格式应为 #RRGGBB。');item.color=args.color;}return{type:'calendar',items:[clone(item)]};});
      case 'create_ledger':return commit(state,'新增账本',()=>{const name=text(args.name,'账本名称',40);if(state.ledgers.includes(name))throw new Error('该账本已经存在。');state.ledgers.push(name);return{type:'ledger',name};});
      case 'undo_operation':{const last=state.undo.at(-1);if(!last)throw new Error('当前没有可撤销的操作。');if(args.operationId&&last.id!==args.operationId)throw new Error('请先撤销更新的操作，避免覆盖后续修改。');for(const key of businessKeys)state[key]=clone(last.before[key]);state.undo.pop();state.lastCreated=state.lastCreated.filter(x=>[...state.transactions,...state.events,...state.tasks].some(r=>r.id===x.id));return{ok:true,type:'undo',label:last.label};}
      case 'export_backup':return{ok:true,type:'download',format:'json',filename:`日历账本备份-${now}.json`,data:JSON.stringify({version:1,...snapshot(state)},null,2)};
      case 'export_csv':{const items=searchTransactions(state,args);const escape=v=>`"${String(v).replace(/"/g,'""')}"`;const safeCell=v=>/^[=+\-@\t\r]/.test(String(v))?`'${v}`:v;const rows=[['日期','类型','金额','分类','账户','账本','备注'],...items.map(t=>[t.date,{expense:'支出',income:'收入',refund:'退款',transfer:'转账'}[t.kind],(t.amount/100).toFixed(2),t.category,t.account,t.ledger,t.note])];return{ok:true,type:'download',format:'csv',filename:`账目-${now}.csv`,data:'\ufeff'+rows.map(r=>r.map(v=>escape(safeCell(v))).join(',')).join('\r\n'),count:items.length};}
      case 'open_settings':return{ok:true,type:'open_settings'};
      default:throw new Error(`这一版尚未提供 ${name} 操作。`);
    }
  }catch(error){return{ok:false,error:error.message};}
}

export function restoreBackup(state,input) {
  if(!input||input.version!==1||!Array.isArray(input.transactions)||!Array.isArray(input.events)||!Array.isArray(input.tasks)||input.transactions.length>20000||input.events.length>10000||input.tasks.length>10000)throw new Error('备份格式或数据数量不符合要求。');
  const restored=createInitialState(todayISO(),false);
  if(!Array.isArray(input.calendars)||input.calendars.length<1||input.calendars.length>100)throw new Error('备份缺少有效日历。');
  restored.calendars=input.calendars.map(c=>({id:validID(c.id),name:text(c.name,'日历名称',40),color:/^#[\da-f]{6}$/i.test(c.color??'')?c.color:'#6882d8'}));
  restored.ledgers=Array.isArray(input.ledgers)?input.ledgers.map(x=>text(x,'账本名称',40)):['个人账本'];
  restored.transactions=input.transactions.map(t=>validateTransaction({...t,amount:t.amount/100,id:text(t.id,'账目ID',100)}));
  restored.events=input.events.map(e=>validateEvent({...e,id:text(e.id,'日程ID',100)},restored));
  restored.tasks=input.tasks.map(t=>({id:validID(t.id),title:text(t.title,'待办标题'),date:validDate(t.date),completed:t.completed===true}));
  const allIds=[...restored.transactions,...restored.events,...restored.tasks,...restored.calendars].map(x=>x.id);if(new Set(allIds).size!==allIds.length)throw new Error('备份含重复记录 ID。');
  const cfg=dispatch(restored,'update_settings',input.settings??{});if(!cfg.ok)throw new Error(cfg.error);
  if(input.budgets){restored.budgets=Object.create(null);for(const [key,value] of Object.entries(input.budgets)){const category=text(key,'预算分类',30);if(!Number.isSafeInteger(value)||value<=0)throw new Error('备份预算金额无效。');restored.budgets[category]=value;}}
  restored.dataMode=input.dataMode==='demo'?'demo':'personal';
  return commit(state,'恢复备份',()=>{for(const key of businessKeys)state[key]=restored[key];return{type:'restore',count:state.transactions.length};});
}

const str = description => ({type:'string',description}); const num=description=>({type:'number',description}); const bool=description=>({type:'boolean',description});
const txProps={date:str('YYYY-MM-DD'),kind:{type:'string',enum:['expense','income','transfer','refund']},amount:num('人民币元，大于0、最多两位小数'),category:str('分类'),note:str('交易内容'),account:str('账户，默认微信'),ledger:str('账本，默认个人账本')};
const eventProps={title:str('标题'),date:str('YYYY-MM-DD'),time:str('HH:MM，24小时制'),duration:num('分钟'),reminder:num('提前提醒分钟，本版保存参数'),calendar:str('日历ID'),repeat:{type:'string',enum:['none','daily','weekly','monthly']},until:str('重复结束日期，空字符串表示无限'),notes:str('备注')};
const filterProps={start:str('起始日期YYYY-MM-DD'),end:str('结束日期YYYY-MM-DD'),category:str('分类，省略为全部'),ledger:str('账本'),account:str('账户'),kind:{type:'string',enum:['expense','income','transfer','refund']},query:str('备注或分类关键词'),excludeCategories:{type:'array',items:str('排除分类')},excludeLedgers:{type:'array',items:str('排除账本')},excludeAccounts:{type:'array',items:str('排除账户')}};
const scopeProps={id:str('必须使用查询得到的记录ID'),scope:{type:'string',enum:['occurrence','future','series'],description:'重复日程修改范围'},occurrenceDate:str('要操作的具体发生日期')};
const slotProps={start:str('起始日期'),end:str('结束日期'),duration:num('每次时长分钟'),count:num('次数1到20'),buffer:num('前后缓冲分钟'),from:str('每天最早HH:MM'),to:str('每天最晚HH:MM'),workdays:bool('仅工作日，默认true'),onePerDay:bool('每天最多安排一次，默认true')};
function tool(name,description,properties={},required=[]){return{type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}};}
export const TOOLS=[
  tool('get_app_context','获取当前日期、时区、界面、最后创建对象、日历与实际能力。'),
  tool('search_transactions','查找真实账目，修改前取得ID。',filterProps),
  tool('create_transactions','一次新增一到五十笔账目。',{items:{type:'array',items:{type:'object',properties:txProps,required:['amount','note'],additionalProperties:false}}},['items']),
  tool('update_transaction','修改一条明确的账目。',{id:str('账目ID'),...txProps},['id']),
  tool('delete_transactions','删除用户明确要求删除的账目。',{ids:{type:'array',items:str('账目ID')}},['ids']),
  tool('query_cashflow','本地计算筛选范围内的真实收支、分类和每日汇总。',filterProps),
  tool('compare_cashflow','将指定本月时段与上月同期比较；默认本月截至今天。',filterProps),
  tool('set_budget','设置总预算或分类预算。',{category:str('分类，全部表示总预算'),amount:num('预算人民币元')},['amount']),
  tool('search_events','查询日程，包括重复日程定义；查找待修改对象。',{start:str('范围开始'),end:str('范围结束'),query:str('标题关键词'),calendar:str('日历ID')}),
  tool('create_event','新增日程并保存提醒参数；系统提醒状态以应用上下文为准。',eventProps,['title','date','time']),
  tool('update_event','修改日程；重复项目必须明确范围。',{...scopeProps,...eventProps},['id']),
  tool('delete_event','删除指定日程或其发生实例。',scopeProps,['id']),
  tool('find_free_slots','根据已有日程寻找无冲突空档，不写入日程。',slotProps),
  tool('schedule_in_free_slots','按要求找足无冲突空档后实际创建日程，找不足则不写入。',{...slotProps,title:str('每个日程标题'),calendar:str('日历ID'),reminder:num('提前提醒分钟')},['title','start','end']),
  tool('search_tasks','查询待办。',{query:str('标题关键词'),completed:bool('是否完成')}),
  tool('create_task','创建待办。',{title:str('标题'),date:str('截止日期')},['title']),
  tool('update_task','修改待办或完成状态。',{id:str('待办ID'),title:str('标题'),date:str('截止日期'),completed:bool('完成状态')},['id']),
  tool('delete_task','删除明确的待办。',{id:str('待办ID')},['id']),
  tool('navigate_calendar','打开页面、指定日期、视图和筛选。',{page:{type:'string',enum:['calendar','ledger','reports','tasks']},date:str('指定日期'),view:{type:'string',enum:['month','week','day']},filter:{type:'string',enum:['all','events','transactions']},category:str('分类，空表示全部'),ledger:str('账本，空表示全部')}),
  tool('get_settings','读取应用设置与预算。'),
  tool('update_settings','修改应用设置。',{theme:{type:'string',enum:['light','dark']},weekStart:{type:'integer',enum:[0,1]},fontSize:{type:'string',enum:['normal','large']},defaultReminder:{type:'integer'},hour24:bool('24小时制')}),
  tool('manage_calendar','新增或更名本地日历、修改颜色。',{action:{type:'string',enum:['create','update']},id:str('修改时需要ID'),name:str('日历名称'),color:str('#RRGGBB')},['action']),
  tool('create_ledger','新增账本。',{name:str('账本名称')},['name']),
  tool('undo_operation','撤销最后一次业务写入。',{operationId:str('仅可撤销最新操作，省略表示最新')}),
  tool('export_backup','生成并下载全部数据的JSON备份。'),
  tool('export_csv','按筛选条件导出账目CSV。',filterProps),
  tool('open_settings','打开设置，可配置API、备份、节假日更新或提醒权限。'),
  tool('get_holidays','查询已获取的中国放假和补班安排，返回数据来源。',{start:str('起始日期'),end:str('结束日期')}),
  tool('update_holidays','联网更新指定年份中国节假日和调休数据，未公布时明确反馈。',{year:{type:'integer',description:'公历年份'}},['year'])
];
