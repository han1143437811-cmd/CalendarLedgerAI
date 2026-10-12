// Daily costs are a projection. They never create or replace actual payments.
const DAY = 86_400_000;
function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('分摊日期应为 YYYY-MM-DD。');
  const number = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(number) || new Date(number).toISOString().slice(0, 10) !== value) throw new Error('分摊日期无效。');
  return number;
}
export function allocationDays(start, end) {
  const count = (dateNumber(end) - dateNumber(start)) / DAY + 1;
  if (!Number.isInteger(count) || count < 1 || count > 366) throw new Error('分摊范围需要是连续 1—366 天。');
  return count;
}
export function dailyShare(cents, start, end, date) {
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1e11) throw new Error('分摊源金额无效。');
  const count = allocationDays(start, end), offset = (dateNumber(date) - dateNumber(start)) / DAY;
  return offset < 0 || offset >= count ? 0 : Math.floor(cents / count) + (offset < cents % count ? 1 : 0);
}
export function validateAllocations(input, transactions) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 20000) throw new Error('分摊计划格式或数量无效。');
  const sources = new Map(transactions.map(row => [row.id, row])), ids = new Set(), targets = new Set();
  return input.map(plan => {
    if (!plan || !/^[A-Za-z0-9_-]{1,100}$/.test(plan.id ?? '') || ids.has(plan.id) || targets.has(plan.transactionId)) throw new Error('分摊计划 ID 或关联账目重复。');
    const source = sources.get(plan.transactionId);
    if (!source || source.kind !== 'expense') throw new Error('分摊必须关联一笔真实支出。');
    allocationDays(plan.start, plan.end); ids.add(plan.id); targets.add(plan.transactionId);
    return {id:plan.id, transactionId:source.id, start:plan.start, end:plan.end};
  });
}
export function projectDailyCosts(state, start, end) {
  dateNumber(start); dateNumber(end);
  if (start > end) throw new Error('起始日期不能晚于结束日期。');
  const plans = new Map((state.expenseAllocations ?? []).map(plan => [plan.transactionId, plan]));
  const records = [];
  for (const source of state.transactions) {
    const plan = source.kind === 'expense' ? plans.get(source.id) : null;
    if (!plan) { if (source.date >= start && source.date <= end) records.push({...source}); continue; }
    allocationDays(plan.start, plan.end);
    const from = Math.max(dateNumber(start), dateNumber(plan.start)), to = Math.min(dateNumber(end), dateNumber(plan.end));
    for (let value = from; value <= to; value += DAY) {
      const date = new Date(value).toISOString().slice(0, 10), amount = dailyShare(source.amount, plan.start, plan.end, date);
      if (!amount) continue;
      records.push({...source, id:`${source.id}_share_${date.replaceAll('-', '')}`, date, amount,
        sourceTransactionId:source.id, allocationId:plan.id, paymentDate:source.date});
    }
  }
  return records;
}
