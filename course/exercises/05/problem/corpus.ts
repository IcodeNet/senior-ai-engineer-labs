// Synthetic Northbank Support FAQ content. Northbank is fictional; nothing here is real policy or advice.
export interface Faq {
  id: string;
  title: string;
  text: string;
  status: "draft" | "approved" | "retired";
  /** ISO date (YYYY-MM-DD) from which the answer applies. */
  effectiveDate: string;
  /** ISO date after which the answer must no longer be used, if any. */
  expiryDate?: string;
}

export const FAQS: Faq[] = [
  {
    id: "faq-card-lost",
    title: "Lost or stolen card",
    text: "Freeze your card in the app straight away, then order a replacement. A replacement card arrives in 3 to 5 working days.",
    status: "approved",
    effectiveDate: "2026-01-01",
  },
  {
    id: "faq-refund-time",
    title: "How long does a card refund take",
    text: "A refund from a retailer usually reaches your account within 5 working days of the retailer processing it.",
    status: "approved",
    effectiveDate: "2026-03-01",
  },
  {
    id: "faq-overdraft-fee",
    title: "Overdraft fees",
    text: "Arranged overdrafts cost 39.9% EAR. There is no fee for an unarranged overdraft because we decline the payment.",
    status: "approved",
    effectiveDate: "2026-02-01",
    expiryDate: "2026-12-31",
  },
  {
    id: "faq-overdraft-fee-2027",
    title: "Overdraft fees from 2027",
    text: "From 1 January 2027 arranged overdrafts cost 35.9% EAR.",
    status: "approved",
    effectiveDate: "2027-01-01",
  },
  {
    id: "faq-fx-fee-draft",
    title: "Foreign transaction fees",
    text: "DRAFT: we are considering removing the 2.75% foreign transaction fee on debit cards.",
    status: "draft",
    effectiveDate: "2026-06-01",
  },
  {
    id: "faq-cheque-retired",
    title: "Paying in a cheque by post",
    text: "Send cheques to our Leeds processing centre with a paying-in slip.",
    status: "retired",
    effectiveDate: "2019-01-01",
  },
];
