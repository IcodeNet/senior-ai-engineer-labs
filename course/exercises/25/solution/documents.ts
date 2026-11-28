// Whole Northbank Support documents, before chunking, and labelled questions whose answers are exact spans of them.
// Synthetic data. You do not need to change this file.
import type { Status } from "./northbank.ts";

export interface FaqDocument {
  id: string;
  sourceUri: string;
  title: string;
  status: Status;
  /** YYYY-MM-DDT00:00:00Z */
  effectiveDate: string;
  expiryDate: string | null;
  /** Markdown: one # title, ## sections, paragraphs and lists. */
  body: string;
}

export interface LabelledQuestion {
  question: string;
  sourceUri: string;
  /** The exact text of the body that answers the question. */
  answer: string;
}

const FAQ = "https://support.northbank.example/guides";

export const DOCUMENTS: FaqDocument[] = [
  {
    id: "overdrafts",
    sourceUri: `${FAQ}/overdrafts`,
    title: "Overdrafts explained",
    status: "approved",
    effectiveDate: "2026-02-01T00:00:00Z",
    expiryDate: null,
    body: `# Overdrafts explained

An overdraft lets you borrow money through your current account when your balance goes below zero. This guide explains how arranged overdrafts are priced, what happens when a payment would take you past your limit, and how to change your limit.

## How much an arranged overdraft costs

An arranged overdraft costs 39.9% EAR variable. Interest is charged daily on the overdrawn balance and taken from your account monthly, on the first working day of the month. There is no separate monthly fee for having an overdraft, and no interest is charged if you stay in credit.

## Going past your limit

There is no fee for an unarranged overdraft. Payments that would take you past your limit are returned unpaid, free of charge, and we send you a notification in the app. Standing orders are retried once on the same day.

## Changing your limit

You can ask for a higher limit in the app under Account, then Overdraft. We run a soft credit check that does not affect your credit score, and most decisions are instant. You can lower or remove your limit at any time, as long as you are not using it.
`,
  },
  {
    id: "cards",
    sourceUri: `${FAQ}/cards`,
    title: "Your debit card",
    status: "approved",
    effectiveDate: "2025-06-01T00:00:00Z",
    expiryDate: null,
    body: `# Your debit card

Your Northbank debit card works in shops, online and at cash machines worldwide. This guide covers freezing a card, reporting it lost or stolen, and disputing a payment.

## Freezing your card

Freeze your card straight away in the app under Cards, then Freeze. While it is frozen, card payments and cash withdrawals are declined, but direct debits and standing orders still go out. Unfreezing is instant if you find it.

## Lost or stolen cards

To report a card stolen, call 0800 000 0101 at any time. We cancel the card and send a replacement within three working days. Your card number changes, so update any shops that store it.

## Disputing a payment

If a retailer will not refund you, raise a dispute in the app within 120 days of the payment. Choose the payment, then Something's wrong. We may make a temporary credit while we investigate, and we aim to resolve disputes within 45 days.
`,
  },
  {
    id: "abroad",
    sourceUri: `${FAQ}/abroad`,
    title: "Using your account abroad",
    status: "approved",
    effectiveDate: "2026-01-15T00:00:00Z",
    expiryDate: "2026-12-31T00:00:00Z",
    body: `# Using your account abroad

You can spend, withdraw and send money abroad with your Northbank account. Fees depend on the currency and on how you pay.

## Spending abroad

Card payments abroad are converted at the Mastercard exchange rate with no Northbank fee. Cash withdrawals abroad are free up to 200 pounds a month, then cost 2% of the amount withdrawn.

## Sending money abroad

International payments in euros to SEPA countries are free and usually arrive the next working day. Payments in other currencies cost a flat fee of 5 pounds plus the exchange-rate margin shown before you confirm. You can send up to 25,000 pounds a day in the app.
`,
  },
];

export const QUESTIONS: LabelledQuestion[] = [
  { question: "How much does an arranged overdraft cost?", sourceUri: `${FAQ}/overdrafts`, answer: "An arranged overdraft costs 39.9% EAR variable. Interest is charged daily on the overdrawn balance and taken from your account monthly, on the first working day of the month." },
  { question: "Is there a fee if a payment would take me past my limit?", sourceUri: `${FAQ}/overdrafts`, answer: "There is no fee for an unarranged overdraft. Payments that would take you past your limit are returned unpaid, free of charge" },
  { question: "Does asking for a higher overdraft limit affect my credit score?", sourceUri: `${FAQ}/overdrafts`, answer: "We run a soft credit check that does not affect your credit score, and most decisions are instant." },
  { question: "Do direct debits still go out while my card is frozen?", sourceUri: `${FAQ}/cards`, answer: "While it is frozen, card payments and cash withdrawals are declined, but direct debits and standing orders still go out." },
  { question: "How quickly do I get a replacement for a stolen card?", sourceUri: `${FAQ}/cards`, answer: "We cancel the card and send a replacement within three working days." },
  { question: "How long do I have to dispute a card payment?", sourceUri: `${FAQ}/cards`, answer: "raise a dispute in the app within 120 days of the payment" },
  { question: "What does it cost to withdraw cash abroad?", sourceUri: `${FAQ}/abroad`, answer: "Cash withdrawals abroad are free up to 200 pounds a month, then cost 2% of the amount withdrawn." },
  { question: "What does a payment in dollars cost?", sourceUri: `${FAQ}/abroad`, answer: "Payments in other currencies cost a flat fee of 5 pounds plus the exchange-rate margin shown before you confirm." },
];
