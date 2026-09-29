# Mark paid in Google Sheets — version 1.5.0

When Sheets is connected, clicking **Mark paid** and confirming now records one row in the **Payments** tab of your existing spreadsheet. The row contains the marked-paid date in Philippine time, subscription name, amount, currency, original bill due date, next due date, status **Marked paid**, account, subscription ID and unique payment ID.

The Subscriptions tab remains the original as-added log. Payments is the payment history: each billing cycle gets a separate row so earlier payments are not overwritten. The existing payment-confirmation emails remain available. This records your manual action; it does not verify payment with a bank or provider.

## Update each account

1. Download/extract the package matching joynojohn@gmail.com or acctgjoynoinc@gmail.com.
2. Open that account's EXISTING Google Apps Script project. Replace Code.gs with the package's gmail-setup/Code.gs and Save.
3. Select **setupSheets → Run**. It reuses your spreadsheet and creates the Payments tab, preserving all existing rows. Approve Google authorization if requested. Do not delete the spreadsheet, script properties or old deployment.
4. Choose **Deploy → Manage deployments → Edit (pencil) → New version → Deploy**. Keep the same URL, connection key, Execute as Me and access Anyone.
5. Replace the installed extension files with the contents of the package's extension folder, then Reload at chrome://extensions. Do not uninstall.
6. Confirm **Spreadsheet records** shows Connected. If not, click Connect Sheets.
7. Mark a test subscription paid and confirm. Click Open spreadsheet, then open the **Payments** tab at the bottom. Verify its status and next due date.

## Pending records

The payment and queued spreadsheet row are saved locally together. If offline, Google fails, or the script has not been updated, the row remains pending and retries after five minutes while Chrome is running with internet access. A lost server response does not create a duplicate: the Payment ID is checked under a Google script lock. Pending rows survive local subscription deletion and restart. Do not click Mark paid again to retry: that records another cycle.

Only payments recorded while Sheets is connected are queued. Earlier payments are not retroactively imported. Disconnect pauses pending rows until reconnection; payments made while disconnected are not queued. Do not manually delete/change payment IDs or the ten headers, because those protect the structure and duplicate detection.

The setup and row-saving logic are covered by automated tests with simulated Google services. Actual sheet layout and delivery must be checked in your accounts after deployment.
