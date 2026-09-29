import {validate,parts,nextDate,reminderAt,notificationId,money,dayDistance,dateKey} from './domain.js';
export function createEngine(api, now=()=>Date.now(), uuid=()=>crypto.randomUUID(), email=null) {
  let tail = Promise.resolve();
  const enqueue = fn => { const task = tail.then(fn); tail = task.catch(()=>{}); return task; };
  async function read() {
    const {duewise} = await api.storage.local.get('duewise');
    if(duewise && duewise.version !== 1) throw new Error('Unsupported data version. Update Joyno Subcription Renewal before continuing.');
    return duewise ?? {version:1,subscriptions:[]};
  }
  const save = data => api.storage.local.set({duewise:data});
  async function reconcile(data) {
    if(!await api.alarms.get('duewise:watch')) await api.alarms.create('duewise:watch',{periodInMinutes:1});
    const permission = await api.notifications.getPermissionLevel();
    for(const s of data.subscriptions) {
      if(reminderAt(s) > now() || s.notificationClaim || permission !== 'granted') continue;
      // Persist the claim BEFORE the external side effect: a worker crash must never duplicate a cycle.
      s.notificationClaim = {at:now(),status:'claimed'};
      await save(data);
      try {
        const overdue=dayDistance(s.dueDate,new Date(now()))<0;
        await api.notifications.create(notificationId(s),{type:'basic',iconUrl:api.runtime.getURL('icons/icon128.png'),title:`${s.name} payment ${overdue?'overdue':'reminder'}`,message:`${money(s)} ${overdue?'was due':'is due'} ${s.dueDate}. Open Joyno Subcription Renewal to mark it paid.`,priority:1});
        s.notificationClaim.status='sent';
      } catch (error) {
        // Do not retry an ambiguous delivery. The persistent in-app reminder remains visible.
        s.notificationClaim.status='failed';
      }
      await save(data);
    }
    const overdue = data.subscriptions.filter(s=>dayDistance(s.dueDate,new Date(now()))<0).length;
    await api.action.setBadgeText({text:overdue?String(overdue):''});
    await api.action.setBadgeBackgroundColor({color:'#B84E35'});
    const future = data.subscriptions.map(reminderAt).filter(t=>t>now());
    if(future.length) await api.alarms.create('duewise:next',{when:Math.min(...future)});
    else await api.alarms.clear('duewise:next');
    if(email)await email.reconcile(data,save);
    if(email?.reconcileSheets)await email.reconcileSheets(data,save);
    return {...data,notificationPermission:permission,email:email?await email.status():{enabled:false}};
  }
  return {run: (message={type:'check'}) => enqueue(async()=>{
    const data=await read();
    const index=data.subscriptions.findIndex(s=>s.id===message.id);
    let clearId;
    if(['email-configure','email-test','email-disable','sheet-connect','sheet-disconnect'].includes(message.type)) {
      if(!email)throw new Error('Email service is unavailable.');
      await email.command(message);
      // Keep connection/test actions separate from automatic bill delivery.
      return {...data,notificationPermission:await api.notifications.getPermissionLevel(),email:await email.status()};
    } else if(message.type==='add') {
      const fields=validate(message.subscription);
      const s={...fields,id:uuid(),cycleToken:uuid(),anchorDay:parts(fields.dueDate)[2],revision:1,notificationClaim:null,createdAt:new Date(now()).toISOString()};
      data.subscriptions.push(s);
      if(email&&(await email.status()).sheets?.enabled){
        data.sheetEntries??=[];
        data.sheetEntries.push({action:'sheet-add',id:s.id,...fields,createdAt:s.createdAt,delivery:{status:'pending'}});
        s.sheetLogged=true;
      }
      await save(data);
    } else if(['edit','delete','paid'].includes(message.type)) {
      if(index<0) throw new Error('This subscription no longer exists. Reopen Joyno Subcription Renewal.');
      const s=data.subscriptions[index];
      if(message.revision !== s.revision) throw new Error('This subscription changed. Reopen Joyno Subcription Renewal and try again.');
      clearId=notificationId(s);
      if(message.type==='delete') data.subscriptions.splice(index,1);
      if(message.type==='paid') {
        const nextDueDate=nextDate(s),paidAt=dateKey(new Date(now()));
        const receiptId=`paid:${s.id}:${s.cycleToken}`;
        const connection=email?await email.status():null;
        const emailEnabled=connection?.enabled;
        if(emailEnabled){
          data.paymentEmails??=[];
          // Save the receipt snapshot atomically with the payment, before any network request.
          data.paymentEmails.push({id:receiptId,action:'paid',name:s.name,price:s.price,currency:s.currency,dueDate:s.dueDate,nextDueDate,paidAt,delivery:{status:'pending'}});
        }
        if(connection?.sheets?.enabled){
          data.sheetEntries??=[];
          data.sheetEntries.push({action:'sheet-paid',id:receiptId,subscriptionId:s.id,name:s.name,price:s.price,currency:s.currency,dueDate:s.dueDate,nextDueDate,paidAt,delivery:{status:'pending'}});
        }
        data.subscriptions[index]={...s,dueDate:nextDueDate,cycleToken:uuid(),notificationClaim:null,emailDelivery:null,revision:s.revision+1,lastPaid:{dueDate:s.dueDate,paidAt,receiptId:emailEnabled?receiptId:null,sheetReceiptId:connection?.sheets?.enabled?receiptId:null}};
      }
      if(message.type==='edit') {
        const fields=validate(message.subscription);
        // Editing a date or price is still the SAME unpaid cycle; preserve its delivery claim.
        data.subscriptions[index]={...s,...fields,anchorDay:fields.dueDate!==s.dueDate?parts(fields.dueDate)[2]:s.anchorDay,revision:s.revision+1};
        clearId=null;
      }
      await save(data);
    } else if(!['check','list'].includes(message.type)) throw new Error('Unknown request.');
    if(clearId) await api.notifications.clear(clearId).catch(()=>{});
    return reconcile(data);
  })};
}
