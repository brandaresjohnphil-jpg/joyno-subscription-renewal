// Personal Gmail relay for Joyno Subcription Renewal.
// Deploy as your account. MailApp only sends mail; it does not read your inbox.
var RECIPIENT = 'joynojohn@gmail.com';

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CONNECTION_KEY')) {
    props.setProperty('CONNECTION_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  // This invokes Google's send-mail authorization; it does not send an email.
  MailApp.getRemainingDailyQuota();
  console.log('CONNECTION KEY (paste only into your extension): ' + props.getProperty('CONNECTION_KEY'));
}

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return reply({ok:false,error:'Use the extension to connect to this email service.'}); }

function doPost(event) {
  var lock;
  try {
    var text = event && event.postData && event.postData.contents;
    if (!text || text.length > 5000) throw new Error('Invalid request.');
    var input = JSON.parse(text);
    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('CONNECTION_KEY');
    if (!key || typeof input.token !== 'string' || input.token !== key) throw new Error('Connection key is incorrect.');
    if (input.action === 'ping') return reply({ok:true,recipient:RECIPIENT});
    if (input.action === 'sheet-status' || input.action === 'sheet-add' || input.action === 'sheet-paid') {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) throw new Error('The spreadsheet is busy. Saving will retry.');
      return reply(handleSheetRequest(input));
    }
    if (input.action !== 'test' && input.action !== 'reminder' && input.action !== 'paid') throw new Error('Unknown request.');
    if (typeof input.id !== 'string' || !/^[A-Za-z0-9:_-]{16,160}$/.test(input.id)) throw new Error('Invalid billing cycle.');
    var subject = 'Joyno Subcription Renewal — Gmail test';
    var body = 'Your Gmail reminders are connected. Unpaid subscription reminders will be sent to ' + RECIPIENT + ' the day before they are due, when Chrome is running.\n\nNo payment is required for this test.';
    if (input.action === 'reminder' || input.action === 'paid') {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || /[\r\n]/.test(input.name) ||
          typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
          typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency) ||
          typeof input.price !== 'number' || !isFinite(input.price) || input.price < 0 || input.price > 1000000000) throw new Error('Invalid subscription details.');
      subject = 'Payment reminder: ' + input.name + ' — due ' + input.dueDate;
      body = input.name + ' has an unpaid subscription payment.\n\nAmount: ' + input.currency + ' ' + input.price + '\nDue date: ' + input.dueDate + '\n\nOpen Joyno Subcription Renewal in Chrome and mark this bill paid after paying it. This records one billing cycle and moves its due date forward.\n\nThis is a reminder, not a payment request. No payment is collected by this extension.';
      if (input.action === 'paid') {
        if (typeof input.nextDueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.nextDueDate) ||
            typeof input.paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.paidAt)) throw new Error('Invalid payment confirmation.');
        subject = 'Marked paid: ' + input.name + ' — bill due ' + input.dueDate;
        body = 'You marked ' + input.name + ' as paid in Joyno Subcription Renewal.\n\nAmount recorded: ' + input.currency + ' ' + input.price + '\nBill due date: ' + input.dueDate + '\nMarked paid on: ' + input.paidAt + ' (Philippine time)\nNext due date: ' + input.nextDueDate + '\n\nThis confirms your manual payment record. The extension does not collect payments or verify transactions with the provider.';
      }
    }
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Email service is busy. It will retry.');
    // Retain existing reminder keys; paid confirmations have a separate deduplication namespace.
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, (input.action === 'paid' ? 'paid:' : '') + input.id);
    var ledgerKey = 'delivery:' + Utilities.base64EncodeWebSafe(digest);
    var existing = props.getProperty(ledgerKey);
    if (existing) return reply({ok:true,recipient:RECIPIENT,status:existing === 'sent' ? 'sent' : 'uncertain'});
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Google daily email quota reached. Pending reminders will retry.');
    if (Object.keys(props.getProperties()).length >= 2500) throw new Error('Email ledger is full. Keep existing delivery records and contact support.');
    // Claim permanently BEFORE sending. Do not delete delivery keys or resend an uncertain cycle.
    props.setProperty(ledgerKey, 'claimed');
    try {
      MailApp.sendEmail({to:RECIPIENT,subject:subject,body:body,name:'Joyno Subcription Renewal'});
      props.setProperty(ledgerKey, 'sent');
      return reply({ok:true,recipient:RECIPIENT,status:'sent'});
    } catch (error) {
      return reply({ok:true,recipient:RECIPIENT,status:'uncertain'});
    }
  } catch (error) {
    return reply({ok:false,error:error.message || 'Email service error.'});
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

// Run this once in the Google editor, signed in to the account that owns this script.
// Re-running it reuses the same file. It does not change your mail key or delivery ledger.
function setupSheets() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('SUBSCRIPTIONS_SHEET_ID');
    var book;
    if (id) book = SpreadsheetApp.openById(id);
    else {
      book = SpreadsheetApp.create('Joyno Subscription Log - ' + RECIPIENT);
      props.setProperty('SUBSCRIPTIONS_SHEET_ID', book.getId());
      book.getSheets()[0].setName('Subscriptions');
    }
    book.setSpreadsheetTimeZone('Asia/Manila');
    var sheet = book.getSheetByName('Subscriptions');
    if (!sheet) throw new Error('The Subscriptions tab was removed. Restore it before continuing.');
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 8).setValues([sheetHeaders()]);
      sheet.getRange(1, 1, 1, 8).setBackground('#294b3b').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 42);
      sheet.setColumnWidths(1, 8, 160);
      sheet.setColumnWidth(2, 230);
      sheet.setColumnWidth(7, 230);
      sheet.setColumnWidth(8, 290);
      sheet.getRange(1, 1, sheet.getMaxRows(), 8).createFilter();
    }
    verifySheetHeaders(sheet);
    paymentSheet(book);
    SpreadsheetApp.flush();
    console.log('SPREADSHEET URL: ' + book.getUrl());
  } finally { lock.releaseLock(); }
}

function sheetHeaders() {
  return ['Added at (Philippine time)', 'Subscription', 'Price', 'Currency', 'Billing cycle', 'Initial next due date', 'Account', 'Subscription ID'];
}
function verifySheetHeaders(sheet) {
  if (JSON.stringify(sheet.getRange(1, 1, 1, 8).getValues()[0]) !== JSON.stringify(sheetHeaders())) {
    throw new Error('Spreadsheet columns were changed. Restore the original eight headers; no rows were written.');
  }
}
function sheetText(value) {
  // Subscription names must be text, never formulas supplied to the spreadsheet.
  return /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
}
function handleSheetRequest(input) {
  var id = PropertiesService.getScriptProperties().getProperty('SUBSCRIPTIONS_SHEET_ID');
  if (!id) throw new Error('Run setupSheets in your Google script, authorize Sheets access, then deploy a new version.');
  var book = SpreadsheetApp.openById(id), sheet = book.getSheetByName('Subscriptions');
  if (!sheet) throw new Error('The Subscriptions tab is missing. Restore it before saving.');
  verifySheetHeaders(sheet);
  if (input.action === 'sheet-status') return {ok:true,recipient:RECIPIENT,url:book.getUrl()};
  if (input.action === 'sheet-paid') return recordSheetPayment(book, input);
  if (typeof input.id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(input.id) ||
      typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 ||
      typeof input.price !== 'number' || !isFinite(input.price) || input.price < 0 || input.price > 1000000000 ||
      typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency) ||
      (input.cycle !== 'monthly' && input.cycle !== 'yearly') ||
      typeof input.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ||
      typeof input.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.createdAt)) throw new Error('Invalid subscription row.');
  var due = new Date(input.dueDate + 'T00:00:00+08:00'), added = new Date(input.createdAt);
  if (!isFinite(due.getTime()) || !isFinite(added.getTime())) throw new Error('Invalid subscription dates.');
  var lastRow = sheet.getLastRow();
  // The subscription ID is stored in the SAME row as its data. A lost response can safely retry.
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (ids[i][0] === input.id) return {ok:true,recipient:RECIPIENT,status:'saved'};
  }
  var row = lastRow + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(row, 3).setNumberFormat('#,##0.00#');
  sheet.getRange(row, 6).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(row, 2).setWrap(true);
  sheet.getRange(row, 1, 1, 8).setValues([[added, sheetText(input.name), input.price, input.currency, input.cycle, due, RECIPIENT, input.id]]);
  SpreadsheetApp.flush();
  return {ok:true,recipient:RECIPIENT,status:'saved'};
}

function paymentSheet(book) {
  var headers = ['Marked paid on (Philippine time)', 'Subscription', 'Amount', 'Currency', 'Bill due date', 'Next due date', 'Status', 'Account', 'Subscription ID', 'Payment ID'];
  var sheet = book.getSheetByName('Payments');
  if (!sheet) sheet = book.insertSheet('Payments');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 10).setValues([headers]);
    sheet.getRange(1, 1, 1, 10).setBackground('#294b3b').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 42);
    sheet.setColumnWidths(1, 10, 160);
    sheet.setColumnWidth(2, 230);
    sheet.setColumnWidth(8, 230);
    sheet.setColumnWidths(9, 2, 290);
    sheet.getRange(1, 1, sheet.getMaxRows(), 10).createFilter();
  }
  if (JSON.stringify(sheet.getRange(1, 1, 1, 10).getValues()[0]) !== JSON.stringify(headers)) throw new Error('Payments columns were changed. Restore the original ten headers; no payment rows were written.');
  return sheet;
}

function recordSheetPayment(book, input) {
  if (typeof input.id !== 'string' || !/^paid:[A-Za-z0-9:_-]{1,155}$/.test(input.id) ||
      typeof input.subscriptionId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(input.subscriptionId) ||
      typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 ||
      typeof input.price !== 'number' || !isFinite(input.price) || input.price < 0 || input.price > 1000000000 ||
      typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) throw new Error('Invalid spreadsheet payment.');
  var dates = [input.paidAt, input.dueDate, input.nextDueDate].map(function(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid payment date.');
    var date = new Date(value + 'T00:00:00+08:00');
    if (!isFinite(date.getTime()) || new Date(date.getTime() + 8*3600000).toISOString().slice(0,10) !== value) throw new Error('Invalid payment date.');
    return date;
  });
  var sheet = paymentSheet(book), last = sheet.getLastRow();
  if (last > 1) {
    var ids = sheet.getRange(2, 10, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (ids[i][0] === input.id) return {ok:true,recipient:RECIPIENT,status:'saved'};
  }
  var row = last + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(row, 3).setNumberFormat('#,##0.00#');
  sheet.getRange(row, 5, 1, 2).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(row, 2).setWrap(true);
  sheet.getRange(row, 1, 1, 10).setValues([[dates[0],sheetText(input.name),input.price,input.currency,dates[1],dates[2],'Marked paid',RECIPIENT,input.subscriptionId,input.id]]);
  SpreadsheetApp.flush();
  return {ok:true,recipient:RECIPIENT,status:'saved'};
}

