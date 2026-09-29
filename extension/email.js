import {reminderAt} from './domain.js';
export const EMAIL_RECIPIENT='joynojohn@gmail.com';
export const EMAIL_ORIGINS=['https://script.google.com/*','https://script.googleusercontent.com/*'];
export function validateEmailSettings(value) {
  const endpoint=String(value.endpoint??'').trim(),token=String(value.token??'').trim();
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) throw new Error('Paste the Google web app URL ending in /exec.');
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Paste the connection key from the Google script setup.');
  return {endpoint,token};
}
export function createEmailService(api,fetcher=fetch,now=()=>Date.now()) {
  const read=async()=> (await api.storage.local.get('joynoEmail')).joynoEmail;
  const readSheets=async()=> (await api.storage.local.get('joynoSheets')).joynoSheets;
  async function call(config,payload) {
    if(!await api.permissions.contains({origins:EMAIL_ORIGINS}))throw new Error('Open Email reminders and connect again to allow access to Google Apps Script.');
    let response;
    try{response=await fetcher(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({...payload,token:config.token}),credentials:'omit',redirect:'follow',signal:AbortSignal.timeout(10000)});}
    catch{throw new Error('Google could not be reached. Pending email reminders will retry automatically.');}
    let result;try{result=await response.json();}catch{throw new Error('Google returned a sign-in page or invalid response. Check deployment access is Anyone and use the /exec URL.');}
    if(!response.ok||!result.ok)throw new Error(result.error||'The Google email service could not complete this request.');
    if(result.recipient!==EMAIL_RECIPIENT)throw new Error('The script recipient does not match joynojohn@gmail.com.');
    return result;
  }
  return {
    async status(){const c=await read(),sheet=await readSheets();return {enabled:Boolean(c),endpoint:c?.endpoint??'',recipient:EMAIL_RECIPIENT,sheets:{enabled:Boolean(c&&sheet&&sheet.endpoint===c.endpoint),url:c&&sheet?.endpoint===c.endpoint?sheet.url:''}};},
    async command(message){
      if(message.type==='email-disable'){await api.storage.local.remove('joynoEmail');return;}
      if(message.type==='sheet-disconnect'){await api.storage.local.remove('joynoSheets');return;}
      const old=await read();
      if(message.type==='email-configure'){
        const config=validateEmailSettings({endpoint:message.endpoint,token:message.token|| (old?.endpoint===message.endpoint?old.token:'')});
        await call(config,{action:'ping'});
        await api.storage.local.set({joynoEmail:config});return;
      }
      if(!old)throw new Error('Connect your Google script first.');
      if(message.type==='sheet-connect'){
        let result;try{result=await call(old,{action:'sheet-status'});}catch(error){throw new Error(error.message==='Unknown request.'?'Update your Google script, run setupSheets, then deploy a new version.':error.message);}
        if(!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit$/.test(result.url??''))throw new Error('Google did not return a valid spreadsheet URL. Run setupSheets in your Google script.');
        await api.storage.local.set({joynoSheets:{endpoint:old.endpoint,url:result.url}});return;
      }
      const result=await call(old,{action:'test',id:`test:${crypto.randomUUID()}`});
      if(result.status!=='sent')throw new Error('Test email delivery is uncertain. Check Gmail and Google script executions.');
    },
    async reconcileSheets(data,save){
      const config=await read(),sheet=await readSheets();
      if(!config||!sheet||sheet.endpoint!==config.endpoint)return;
      const entry=(data.sheetEntries??[]).find(r=>r.delivery?.status!=='saved'&&(r.delivery?.retryAt??0)<=now());
      if(!entry)return;
      const {delivery,...payload}=entry;
      try{
        const result=await call(config,payload);
        if(result.status!=='saved')throw new Error('The sheet did not confirm that the subscription was saved.');
        entry.delivery={status:'saved',at:now()};
      }catch(error){entry.delivery={status:'pending',retryAt:now()+5*60000,error:error.message==='Unknown request.'?'Update your Google script, run setupSheets, and deploy a new version.':error.message};}
      const saved=data.sheetEntries.filter(r=>r.delivery?.status==='saved').slice(-20);
      const keep=new Set(saved.map(r=>r.id));
      data.sheetEntries=data.sheetEntries.filter(r=>r.delivery?.status!=='saved'||keep.has(r.id));
      await save(data);
    },
    async reconcile(data,save){
      const config=await read();if(!config)return;
      const receipt=(data.paymentEmails??[]).find(r=>!['sent','uncertain'].includes(r.delivery?.status)&&(r.delivery?.retryAt??0)<=now());
      if(receipt){
        const {delivery,...payload}=receipt;
        try{
          const result=await call(config,payload);
          if(!['sent','uncertain'].includes(result.status))throw new Error('Unexpected payment email status.');
          receipt.delivery={status:result.status,at:now()};
        }catch(error){receipt.delivery={status:'pending',retryAt:now()+5*60000,error:error.message==='Unknown request.'?'Update your Google script and deploy a new version to enable payment confirmations.':error.message};}
        // Pending receipts survive edits, deletion, offline periods and worker/browser restarts.
        const finished=data.paymentEmails.filter(r=>['sent','uncertain'].includes(r.delivery?.status));
        const keep=new Set(finished.slice(-20).map(r=>r.id));
        data.paymentEmails=data.paymentEmails.filter(r=>!['sent','uncertain'].includes(r.delivery?.status)||keep.has(r.id));
        await save(data);
        return;
      }
      // Limit work per activation; a slow network must not occupy the worker indefinitely.
      let attempts=0;
      for(const s of data.subscriptions){
        const delivery=s.emailDelivery;
        if(reminderAt(s)>now()||['sent','uncertain'].includes(delivery?.status)||(delivery?.retryAt??0)>now())continue;
        if(attempts++>=1)break;
        try{
          const result=await call(config,{action:'reminder',id:`${s.id}:${s.cycleToken}`,name:s.name,price:s.price,currency:s.currency,dueDate:s.dueDate});
          if(!['sent','uncertain'].includes(result.status))throw new Error('Unexpected email delivery status.');
          s.emailDelivery={status:result.status,at:now()};
        }catch(error){s.emailDelivery={status:'pending',retryAt:now()+5*60000,error:error.message};}
        // If this write is interrupted, the relay's permanent cycle ledger prevents another send.
        await save(data);
      }
    }
  };
}
