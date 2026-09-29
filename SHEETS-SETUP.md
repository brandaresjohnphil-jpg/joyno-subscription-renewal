# Automatic Google Sheets log — version 1.4.0

This update creates one private Google spreadsheet for each account when you run **setupSheets** in that account's Google script. The sheets have not been created remotely by this chat; Google needs you to authorize access first.

Use the John package for **joynojohn@gmail.com** and the accounting package for **acctgjoynoinc@gmail.com**. Repeat these steps separately for each account.

## Setup

1. Download and extract the correct package for the account. Keep the current extension installation and Google script project.
2. Sign into the matching Google account and open its **existing Apps Script project**.
3. Replace all of Code.gs with the package's **gmail-setup/Code.gs** and save. Check that RECIPIENT near the top matches the account's intended email recipient.
4. In the function dropdown beside Run, select **setupSheets** and click **Run**. Review and authorize Google's spreadsheet-access permission. This creates the new sheet in the script account's Drive. It does not change the connection key or email delivery history.
5. Open **Execution log**. The line **SPREADSHEET URL** is your new sheet's link. Running setupSheets again reuses the same sheet. You can also find it in Google Drive as **Joyno Subscription Log - [email address]**.
6. Select **Deploy → Manage deployments → your existing deployment → Edit (pencil) → Version: New version → Deploy**. Keep Execute as Me and Who has access Anyone. Your /exec URL and connection key stay the same. The spreadsheet itself stays private; do not make it public.
7. Copy the package's **extension** contents into the same folder you previously loaded in Chrome. Open chrome://extensions and click **Reload**. Do not uninstall the extension.
8. Open the extension. Verify Gmail is connected to the correct script, then click **Connect Sheets** in the **New subscription log** section. It verifies the Google setup and shows **Open spreadsheet**.
9. Add a new subscription. Its row will appear automatically while Chrome is running online. Click Open spreadsheet to confirm.

## Columns

Version 1.5.0 also records Mark paid actions in a separate **Payments** tab. Run setupSheets again and deploy the updated script to add that tab without replacing existing data. Follow PAYMENT-SHEETS.md for the upgrade. Each payment row shows status Marked paid, the paid bill's amount/date, when you marked it paid and the next due date.

- Added at (Philippine time)
- Subscription name
- Price (numeric)
- Currency
- Billing cycle
- Initial next due date (a sortable date)
- Account
- Subscription ID (used to prevent duplicate rows)

The sheet records new additions made AFTER Connect Sheets. It is an **as-added log**, not a live copy of all extension data. Existing subscriptions are not automatically imported; subsequent edits, payments and deletions do not change the original rows. Don't delete/re-add real subscriptions just to log them, because that resets their billing-cycle identity and reminder history.

## Reliability and controls

- Adding a subscription saves it locally first. If the spreadsheet save fails, its row is queued locally and retried after five minutes while Chrome runs online. Closing/restarting Chrome does not discard pending rows.
- A lost response retries using the same subscription ID. The Google script checks the ID under a lock before adding a row, avoiding duplicates.
- Each queue item is a snapshot from the original Add action. Editing/deleting the subscription afterward does not cancel that original log entry, including when it is waiting to upload.
- Disconnect in the New subscription log section pauses logging. Previously queued rows resume when you reconnect. New additions while disconnected are not queued. Disconnecting Gmail also pauses Sheets because both use the same authenticated script connection.
- Keep the eight headers and Subscription ID column intact. Headers are checked before writing. If renamed, restore them; the extension shows a pending/error message instead of overwriting the sheet.
- Do not remove script properties, replace the spreadsheet, or delete its ID column. The sheet is used for duplicate detection. Deleting a saved row can weaken duplicate protection for an interrupted request.
- The extension keeps pending snapshots and the 20 latest completed save records locally. The Google sheet keeps its rows until you manage/delete them yourself.

## Check the upgrade

Create one clearly named test subscription due well in the future. Confirm all eight columns in the matching account's sheet. Restart Chrome and confirm the row does not duplicate. Mark the bill paid only if you also want to test the separate payment-confirmation email; the original spreadsheet row will remain unchanged. Delete the test subscription and its spreadsheet row when finished.

Automated tests cover script creation/reuse, authentication, typed amounts/dates, formula-safe names, duplicate prevention, offline retry, lost responses and pause/reconnect. Actual Google account permissions, row appearance and visual sheet layout still need this live check.

The existing one-day-before reminders and Mark paid confirmation emails remain available. Chrome must be running with internet access to process queued Google requests.
