export const BILLING_TIME_ZONE='Asia/Manila';
const PH_OFFSET_MS=8*60*60*1000;
export function parts(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid due date.');
  const [y,m,d] = value.split('-').map(Number);
  if(y < 1900 || y > 9998 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y,m,0)).getUTCDate()) throw new Error('Enter a valid due date (1900–9998).');
  return [y,m,d];
}
export function dateKey(date = new Date()) {
  return new Date(date.getTime()+PH_OFFSET_MS).toISOString().slice(0,10);
}
export function reminderAt(s) {
  const [y,m,d] = parts(s.dueDate);
  // Philippine Standard Time is UTC+08:00, independent of the PC's time zone.
  return Date.UTC(y,m-1,d-1)-PH_OFFSET_MS;
}
export function dayDistance(value, now = new Date()) {
  const [y,m,d] = parts(value);
  const [ny,nm,nd]=parts(dateKey(now));
  return Math.round((Date.UTC(y,m-1,d)-Date.UTC(ny,nm-1,nd))/86400000);
}
export function nextDate(s) {
  const [y,m] = parts(s.dueDate);
  const target = new Date(Date.UTC(y + (s.cycle==='yearly'?1:0),m-1+(s.cycle==='monthly'?1:0),1));
  target.setUTCDate(Math.min(s.anchorDay,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));
  const result = target.toISOString().slice(0,10); parts(result); return result;
}
export function validate(input) {
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 80) throw new Error('Name must contain 1–80 characters.');
  const price = Number(input.price);
  if(input.price === '' || !Number.isFinite(price) || price < 0 || price > 1000000000) throw new Error('Enter a price from 0 to 1,000,000,000.');
  const currency = String(input.currency ?? '').trim().toUpperCase();
  if (!Intl.supportedValuesOf('currency').includes(currency)) throw new Error('Choose a valid currency.');
  const digits = new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
  if(Math.abs(price*10**digits-Math.round(price*10**digits))>0.00001) throw new Error(`${currency} supports ${digits} decimal places.`);
  if (!['monthly','yearly'].includes(input.cycle)) throw new Error('Choose monthly or yearly billing.');
  parts(input.dueDate);
  return {name,price,currency,cycle:input.cycle,dueDate:input.dueDate};
}
export function money(s) { return new Intl.NumberFormat(undefined,{style:'currency',currency:s.currency}).format(s.price); }
export function notificationId(s) { return `duewise:${s.id}:${s.cycleToken}`; }
