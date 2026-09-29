import {BILLING_TIME_ZONE,dateKey,dayDistance,money,nextDate} from './domain.js';
import {EMAIL_ORIGINS} from './email.js';
const $=id=>document.getElementById(id);
const extensionAvailable=typeof chrome!=='undefined'&&typeof chrome.runtime?.sendMessage==='function'&&Boolean(chrome.storage?.onChanged);
const installMessage='To save subscriptions and receive reminders, install this folder using chrome://extensions → Developer mode → Load unpacked, then open Joyno Subcription Renewal from the Chrome toolbar.';
let subscriptions=[],filter='all',editing=null,busy=false,pending=null;
let paymentEmails=[];
let sheetEntries=[];
let emailStatus={enabled:false,endpoint:''};
async function request(message){if(!extensionAvailable)throw new Error(installMessage);const result=await chrome.runtime.sendMessage(message);if(!result?.ok)throw new Error(result?.error||'Unable to connect to Joyno Subcription Renewal. Reload the extension at chrome://extensions and reopen it from the toolbar.');return result.data;}
function showError(e){$('error').textContent=e.message;$('error').hidden=false;}
function apply(data){subscriptions=data.subscriptions;paymentEmails=data.paymentEmails??[];sheetEntries=data.sheetEntries??[];emailStatus=data.email??{enabled:false,endpoint:''};$('permission').hidden=data.notificationPermission==='granted';render();}
async function refresh(){try{apply(await request({type:'list'}));}catch(e){showError(e);}}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function render(){
  const sheet=emailStatus.sheets,waiting=sheetEntries.filter(r=>r.delivery?.status==='pending');
  $('sheet-summary').textContent=sheet?.enabled?(waiting.length?`${waiting.length} record(s) waiting to save`:'Connected · logs subscriptions and payments'):'Google Sheets not connected';
  if(waiting[0]?.delivery.error)$('sheet-summary').textContent+=` · ${waiting[0].delivery.error}`;
  $('sheet-link').hidden=!sheet?.enabled;
  if(sheet?.enabled&&/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/edit$/.test(sheet.url))$('sheet-link').href=sheet.url;
  else $('sheet-link').removeAttribute('href');
  $('sheet-connect').hidden=Boolean(sheet?.enabled);$('sheet-disconnect').hidden=!sheet?.enabled;
  $('email-summary').textContent=emailStatus.enabled?'Connected · joynojohn@gmail.com':'Not connected';
  const queued=paymentEmails.filter(r=>r.delivery?.status==='pending').length;
  if(queued)$('email-summary').textContent+=` · ${queued} payment confirmation(s) pending`;
  $('email-open').textContent=emailStatus.enabled?'Settings':'Set up Gmail';
  document.querySelector('.local').textContent=emailStatus.enabled?'GMAIL ON':'LOCAL ONLY';
  $('email-test').disabled=!emailStatus.enabled;$('email-disable').disabled=!emailStatus.enabled;
  const now=new Date();$('today').textContent=new Intl.DateTimeFormat(undefined,{timeZone:BILLING_TIME_ZONE,weekday:'long',month:'long',day:'numeric'}).format(now);
  $('zone').textContent='Philippine Time (Asia/Manila · UTC+8)';
  $('overdue-count').textContent=String(subscriptions.filter(s=>dayDistance(s.dueDate,now)<0).length);
  $('soon-count').textContent=String(subscriptions.filter(s=>{const d=dayDistance(s.dueDate,now);return d>=0&&d<=7;}).length);
  $('total-count').textContent=String(subscriptions.length);$('list').replaceChildren();
  const shown=[...subscriptions].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.name.localeCompare(b.name)).filter(s=>{const d=dayDistance(s.dueDate,now);return filter==='all'||(filter==='overdue'?d<0:d>=0&&d<=7);});
  if(!shown.length){const empty=node('div',undefined,'empty');empty.append(node('strong',subscriptions.length?'You’re all caught up.':'Make room for peace of mind.'),node('span',subscriptions.length?'No payments in this view.':'Add your first subscription to get started.'));$('list').append(empty);}
  for(const s of shown){const d=dayDistance(s.dueDate,now),card=node('article',undefined,'card'),top=node('div',undefined,'card-top'),identity=node('div',undefined,'identity'),info=node('div');info.append(node('h4',s.name),node('small',`Due ${s.dueDate}`));identity.append(node('div',s.name.slice(0,2).toUpperCase(),'avatar'),info);const amount=node('div',money(s),'amount');amount.append(node('small',s.cycle==='monthly'?'per month':'per year'));top.append(identity,amount);const bottom=node('div',undefined,'card-bottom'),status=node('span',d<0?`${-d} day${d===-1?'':'s'} overdue`:d===0?'Due today':`Due in ${d} days`,d<0?'status overdue':'status'),actions=node('div',undefined,'actions');
    for(const [label,action,cls] of [['Mark paid','paid','paid'],['Edit','edit',''],['Delete','delete','']]){const b=node('button',label,cls);b.setAttribute('aria-label',`${label}: ${s.name}`);b.addEventListener('click',()=>action==='edit'?openEditor(s):confirmAction(s,action));actions.append(b);}bottom.append(status,actions);card.append(top,bottom);
    if(s.notificationClaim?.status==='failed'||s.notificationClaim?.status==='claimed')card.append(node('p','Desktop delivery could not be confirmed. This bill still needs your attention.','muted'));
    if(s.emailDelivery?.status==='sent')card.append(node('p','Email reminder sent.','muted'));
    if(s.emailDelivery?.status==='uncertain')card.append(node('p','Email delivery is uncertain. Check Gmail; this bill will not be emailed again to avoid duplicates.','muted'));
    if(emailStatus.enabled&&s.emailDelivery?.status==='pending')card.append(node('p',`Email pending: ${s.emailDelivery.error}`,'muted'));
    const receipt=paymentEmails.find(r=>r.id===s.lastPaid?.receiptId);
    const sheetEntry=sheetEntries.find(r=>r.id===s.id);
    if(sheetEntry)card.append(node('p',sheetEntry.delivery?.status==='saved'?'Added to your spreadsheet.':'Spreadsheet save pending.','muted'));
    const sheetReceipt=sheetEntries.find(r=>r.id===s.lastPaid?.sheetReceiptId);
    if(sheetReceipt)card.append(node('p',sheetReceipt.delivery?.status==='saved'?'Marked paid recorded in the Payments tab.':`Payment recorded locally; spreadsheet update pending. ${sheetReceipt.delivery?.error??''}`,'muted'));
    if(receipt){
      const status=receipt.delivery?.status;
      card.append(node('p',status==='sent'?`Payment confirmation emailed for bill due ${receipt.dueDate}.`:status==='uncertain'?'Payment recorded; email delivery uncertain. Check Gmail.':`Payment recorded; confirmation email pending. ${receipt.delivery?.error??''}`,'muted'));
    }
    $('list').append(card);
  }
}
function openEditor(s=null){editing=s;$('form').reset();$('form-title').textContent=s?'Edit subscription':'Add subscription';$('form-error').textContent='';const values=s??{name:'',price:'',currency:'USD',cycle:'monthly',dueDate:dateKey()};for(const key of ['name','price','currency','cycle','dueDate'])$('form').elements.namedItem(key).value=values[key];$('editor').showModal();}
function confirmAction(s,type){pending={s,type};$('confirm-title').textContent=type==='paid'?'Mark this bill paid?':'Delete subscription?';$('confirm-text').textContent=type==='paid'?`${s.name}: move the due date from ${s.dueDate} to ${nextDate(s)}. This records one billing cycle, even if other payments are overdue. ${emailStatus.enabled?"A payment confirmation will be emailed to your connected address.":"Connect Gmail to receive payment confirmations."}`:`Remove ${s.name} and its reminders from this device?`;$('accept-confirm').textContent=type==='paid'?'Mark paid':'Delete';$('confirm').showModal();}
$('add').addEventListener('click',()=>openEditor());$('close').addEventListener('click',()=>$('editor').close());$('cancel-confirm').addEventListener('click',()=>$('confirm').close());
$('accept-confirm').addEventListener('click',async()=>{if(busy||!pending)return;busy=true;$('accept-confirm').disabled=true;const {s,type}=pending;try{apply(await request({type,id:s.id,revision:s.revision}));$('confirm').close();}catch(e){$('confirm').close();showError(e);await refresh();}finally{busy=false;$('accept-confirm').disabled=false;}});
$('form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;const button=$('form').querySelector('[type=submit]');button.disabled=true;try{const subscription=Object.fromEntries(new FormData($('form')));apply(await request({type:editing?'edit':'add',id:editing?.id,revision:editing?.revision,subscription}));$('editor').close();}catch(e){$('form-error').textContent=e.message;}finally{busy=false;button.disabled=false;}});
$('email-open').addEventListener('click',()=>{$('email-endpoint').value=emailStatus.endpoint??'';$('email-token').value='';$('email-feedback').textContent='';$('email-dialog').showModal();});
$('email-close').addEventListener('click',()=>$('email-dialog').close());
let emailBusy=false;
async function emailAction(message,success,permission=false){
  if(emailBusy)return;emailBusy=true;
  const buttons=[...$('email-form').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  $('email-feedback').textContent='Connecting…';
  try{
    if(!extensionAvailable)throw new Error(installMessage);
    if(permission&&!await chrome.permissions.request({origins:EMAIL_ORIGINS}))throw new Error('Google access was not granted. Email remains disconnected.');
    apply(await request(message));$('email-token').value='';$('email-feedback').textContent=success;
  }catch(e){$('email-feedback').textContent=e.message;}
  finally{emailBusy=false;buttons.forEach(b=>b.disabled=false);$('email-test').disabled=!emailStatus.enabled;$('email-disable').disabled=!emailStatus.enabled;}
}
$('email-form').addEventListener('submit',event=>{event.preventDefault();emailAction({type:'email-configure',endpoint:$('email-endpoint').value.trim(),token:$('email-token').value.trim()},'Connected. Click Send test email, then check Gmail. Unpaid bills due tomorrow, today or overdue will also be emailed on the next reminder check.',true);});
$('email-test').addEventListener('click',()=>emailAction({type:'email-test'},'Test email accepted by Google. Check your Inbox, Spam and All Mail.'));
$('email-disable').addEventListener('click',()=>emailAction({type:'email-disable'},'Email disconnected. Chrome desktop reminders stay active.'));
let sheetBusy=false;
async function sheetAction(type){
  if(sheetBusy)return;sheetBusy=true;$('sheet-connect').disabled=true;$('sheet-disconnect').disabled=true;
  $('sheet-feedback').textContent='Connecting…';
  try{apply(await request({type}));$('sheet-feedback').textContent=type==='sheet-connect'?'Connected. New subscriptions go to Subscriptions; Mark paid records go to Payments. Existing rows are preserved.':'Spreadsheet logging paused. Existing rows remain in Google Sheets.';}
  catch(e){$('sheet-feedback').textContent=e.message;}
  finally{sheetBusy=false;$('sheet-connect').disabled=false;$('sheet-disconnect').disabled=false;}
}
$('sheet-connect').addEventListener('click',()=>sheetAction('sheet-connect'));
$('sheet-disconnect').addEventListener('click',()=>sheetAction('sheet-disconnect'));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));render();}));
const currencies=Intl.supportedValuesOf('currency');for(const code of currencies){const option=node('option',code);option.value=code;$('currency').append(option);}
if(extensionAvailable)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.duewise)refresh();});
// Date rollover and time-zone changes while the full-page view remains open.
render();
if(extensionAvailable){setInterval(refresh,60000);refresh();}
else{$('installation').textContent=installMessage;$('installation').hidden=false;}


