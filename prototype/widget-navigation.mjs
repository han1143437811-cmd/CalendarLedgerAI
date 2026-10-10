import {validDate} from './core.mjs';

// Launcher entry points only navigate. They never send a message or create data.
export function resolveWidgetNavigation(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.target === 'ai') return {target:'ai'};
  if (payload.target !== 'date' || typeof payload.date !== 'string') return null;
  try {
    const date=validDate(payload.date),year=Number(date.slice(0,4));
    return year>=2020&&year<=2100 ? {target:'date',date} : null;
  } catch { return null; }
}
