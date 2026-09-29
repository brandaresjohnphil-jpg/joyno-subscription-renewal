import {createEngine} from './engine.js';
import {createEmailService} from './email.js';
const engine=createEngine(chrome,()=>Date.now(),()=>crypto.randomUUID(),createEmailService(chrome));
const check=()=>engine.run().catch(error=>console.error('Joyno Subcription Renewal:',error));
chrome.runtime.onInstalled.addListener(check);
chrome.runtime.onStartup.addListener(check);
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name.startsWith('duewise:')) check();});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id) return false;
  engine.run(message).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.notifications.onClicked.addListener(id=>{
  if(id.startsWith('duewise:')) chrome.tabs.create({url:chrome.runtime.getURL('popup.html')});
});
// Rehydrate on every worker activation, even when Chrome has discarded alarms.
check();
