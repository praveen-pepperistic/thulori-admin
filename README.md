# Thulori admin panel

This is the back office where the team runs orders. It's a static page that talks to the
Thulori API (`../server`). There's no build step: deploy this folder to any static host on its own
address, for example `https://admin.thulori.com`.

## Set up

1. In `js/config.js`, set `apiBase` to the API address, for example `https://api.thulori.com`.
2. On the server, set `ADMIN_URL` to this panel's address, for example `https://admin.thulori.com`.
3. Create your account. This gives you the **admin** role, which can see money:

   ```bash
   cd server && npm run seed:staff -- you@thulori.com "Your name" 'a-long-password' admin
   ```

   Team members get the **staff** role. Leave off the last word:

   ```bash
   npm run seed:staff -- writer@thulori.com "Writer" 'their-password'
   ```

4. Open the panel and sign in. A 6-digit code is emailed to you; this needs SMTP to be set up on the server. In development, the code shows in the API log.

To run it locally:

```bash
python3 -m http.server 5174 -d admin
```

The API's `ADMIN_URL` defaults to `http://localhost:5174`.

## What it does

| Screen | |
|---|---|
| **Orders** | Work queues: *Needs attention* (paid twice, paid after cancelling, failed refunds, refunds stuck over 3 days), *Refunds in progress*, ready to write, changes requested, to print & ship, awaiting payment, and so on. You can search by order number, name, phone, email or child, and filter by payment status, edition, state, date range and where the order came from. |
| **Order** | Books with their stages, payments, invoices, the customer and address, team notes, every email/WhatsApp message sent (with failures shown), and an activity log of who did what. |
| **Book workspace** | Photos: view, download one or all as a zip, add photos the customer sent outside the site, read them with AI. Stories: the questions and answers, a writer export, and space to enter answers given outside the site; plus the letter. Proof: upload pages and send the proof, see the customer's notes, record their decision. |
| **Payments** *(admin only)* | Net, gross, refunds and GST collected; a chart by day or month; totals by edition, state and method; all transactions; CSV export. You can filter by period, edition, state, method and type. |
| **New order** | For orders that come in on WhatsApp, by phone or in person. Creates the customer account if needed and emails them a link to set a password. |
| **Customers** | Search customers and jump to their orders or WhatsApp. |

### Every step can be set by hand

When something happens outside the website, record it here and the customer's account updates to match:

| What happened | What to do |
|---|---|
| Customer paid by UPI, bank transfer or cash | **Mark as paid**: method, reference/UTR and date *(admin)* |
| Photos and stories came on WhatsApp or Drive | **Add photos for the customer**, enter answers, then **Mark photos & stories received** |
| Writing is done | **Move to design** |
| The proof is ready | **Upload the proof** to put it on the customer's proof page, with an email and WhatsApp alert |
| Customer approved or asked for changes on WhatsApp or a call | **Record customer's decision** |
| The book has shipped | **Ship order**: courier and tracking number, with an alert |
| The book has arrived | **Mark delivered** |
| Something else | **Set checkpoint…** moves a book to any stage, including back, with a note |

Each action has a *Tell the customer* checkbox, and every action is logged with your name.

### Refunds and problems *(admin only)*

- **Refund…** on an order: choose the payment, the amount and a reason. Cashfree payments go back to the customer's original UPI, card or bank account automatically. Each refund shows *On its way* → *Reached customer* (with the bank reference), or *Failed* with a **Retry** button. **Check status** asks Cashfree straight away.
- Money received by hand (UPI, bank, cash) has to be sent back by hand. The dialog asks how you sent it and the reference.
- **Cancel order** on a paid order can refund everything in the same step.
- A red **Needs attention** box at the top of an order explains the problem: paid twice, paid after cancelling, wrong amount, or a failed refund. Use **Refund this payment**, or **Mark resolved** with a note on what you did. Each problem is also emailed to `TEAM_EMAIL`.
- The customer sees every refund on their order page and gets an email when it starts and when it lands.

### Invoices *(admin only)*

**Create invoice** fills in the storybooks. You can add a line for anything else.

- **Numbering** runs per financial year: `TH/2026-27/0001`.
- **GST**: if the customer is in the same state as the company, the invoice shows CGST + SGST; otherwise IGST.
- **Paid and balance due** are worked out from the payments on the order.
- The invoice is emailed with a private link. The customer can also open it from their order page, and print it or save it as a PDF.

**Void** keeps the invoice on record and never reuses its number.

Before going live, put your registered address and GSTIN in the server settings (`COMPANY_*`), and confirm `GST_RATE` and `INVOICE_HSN` with your CA.
