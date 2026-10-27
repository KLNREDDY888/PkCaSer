# Moneta card-to-savings pilot

A dependency-free web app shell for a private India pilot. It presents the cardholder flow for an issuer-approved cash advance from a person's available credit limit to that same person's savings account.

## Run locally

Requires Node.js 20 or later.

PowerShell:

```powershell
npm.cmd start
```

macOS/Linux:

```sh
npm start
```

Open `http://localhost:3000`. Real sign-in, card linking, account linking, quotes, transfers, and history stay unavailable until identity and payment partners are configured. Use **Enter interactive demo** to sign in without credentials, add fictional sample cards and see their card art, link sample accounts, preview an illustrative quote, simulate a receipt, and view browser-session-only activity. No money moves and no real card or bank details are collected.

## Partner integration gate

The app must remain transfer-disabled until all of the following are complete:

1. Find a bank, card issuer, or authorized provider that explicitly supports a cash advance to the same cardholder's savings account.
2. Obtain written approval and agree on eligible cards/accounts, ownership checks, limits, fee and interest disclosures, settlement, reversals, support ownership, and production access.
3. Complete legal, compliance, security, privacy, and operational review for the exact flow and pilot.
4. Integrate the partner's hosted account-link/card authorization flow and server API behind `src/providers/partner-provider.mjs`. Never collect or store full card credentials in this app.
5. Configure a proper identity provider with secure sessions and MFA, then enforce server-side authorization for every user's own tokenized card and account records. Never store passwords, OTPs, CVV, PIN, or raw card numbers.
6. Add secure persistent storage, idempotency for transfer creation, signed webhook verification, audit events, and operational monitoring before enabling any production transfer.
7. Validate declines, delays, duplicate requests, reversals, ownership mismatch, outages, and support escalation in the partner sandbox. Enable production only after partner approval and operational readiness.

Do not use ordinary merchant checkout and merchant settlement as a substitute for the approved card-to-savings cash-advance route. If no partner approves the requested route, keep transfers unavailable.

### Initial technical candidate to investigate

Evaluate **Visa Direct for Card AFT + Visa Direct for Account payout** through a licensed Visa acquirer or a third-party originator sponsored by one. Visa documents support AFT pull and account payout operations, but market and account-type availability varies; Visa requires program review and production approval. This is only a technical lead: India support for a credit-card-funded cash advance to the same person's savings account has not been confirmed, and no partner has been contracted. Confirm the exact source card type, issuer approval, ownership verification, fees, reversal path, and legal treatment before choosing it.

- [Visa Direct for Card integration and program requirements](https://developer.visa.com/capabilities/visa_direct/docs)
- [Visa Direct for Account and Wallet operations](https://developer.visa.com/capabilities/visa-direct-account-and-wallet/docs-how-to)

## Server interface

- `GET /api/config` reports the transfer feature and partner status.
- `POST /api/cards/link` starts partner-hosted, tokenized card enrollment once configured.
- `GET /api/cards` retrieves the authenticated user's masked card list once configured.
- `POST /api/accounts/link` starts partner-hosted linking once configured.
- `POST /api/transfers/quote` requests a live partner quote before confirmation.
- `POST /api/transfers` creates an approved, idempotent transfer.
- `GET /api/transfers` retrieves the authenticated user's transfer history.
- `GET /api/transfers/:id` retrieves an authenticated transfer's status.
- `POST /api/transfers/:id/reversal` requests a partner-supported reversal.
- `POST /api/webhooks/partner` accepts verified partner status notifications.

The current server implements only safe unavailable responses for real authentication, card enrollment, and money-moving operations. The interactive demo calls a local persistence route for its workspace data, but it does not call real payment routes. Demo sign-in is not real authentication; sample card previews are generated from fictional data and do not contain usable card numbers.
# PkCaSer
Pk-Card-Services
