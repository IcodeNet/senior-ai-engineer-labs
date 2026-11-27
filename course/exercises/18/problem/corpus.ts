// Synthetic policy corpus and labelled queries for the real-Azure steps. Not real company policy.
export interface PolicyChunk {
  id: string;
  docId: string;
  title: string;
  content: string;
  status: "draft" | "approved" | "revoked";
  version: number;
  effectiveDate: string;
}

export const chunks: PolicyChunk[] = [
  { id: "travel@2#0", docId: "travel", title: "Travel policy", content: "Book economy class for flights under six hours. Business class is allowed for flights of six hours or more with director approval.", status: "approved", version: 2, effectiveDate: "2026-01-01T00:00:00Z" },
  { id: "travel@2#1", docId: "travel", title: "Travel policy", content: "Hotel stays are capped at 180 GBP per night in London and 140 GBP elsewhere in the UK.", status: "approved", version: 2, effectiveDate: "2026-01-01T00:00:00Z" },
  { id: "travel@1#0", docId: "travel", title: "Travel policy", content: "Business class is allowed on all international flights.", status: "approved", version: 1, effectiveDate: "2024-01-01T00:00:00Z" },
  { id: "travel@3#0", docId: "travel", title: "Travel policy", content: "DRAFT: business class for every flight over two hours.", status: "draft", version: 3, effectiveDate: "2027-01-01T00:00:00Z" },
  { id: "expenses@1#0", docId: "expenses", title: "Expenses policy", content: "Submit receipts for every expense above 25 GBP within 30 days. Claims without receipts are rejected.", status: "approved", version: 1, effectiveDate: "2025-06-01T00:00:00Z" },
  { id: "expenses@1#1", docId: "expenses", title: "Expenses policy", content: "Client entertainment above 100 GBP per person needs prior approval from a managing director.", status: "approved", version: 1, effectiveDate: "2025-06-01T00:00:00Z" },
  { id: "gifts@1#0", docId: "gifts", title: "Gifts and hospitality", content: "Register any gift or hospitality worth more than 50 GBP in the gifts register within five working days.", status: "approved", version: 1, effectiveDate: "2025-03-01T00:00:00Z" },
  { id: "gifts@1#1", docId: "gifts", title: "Gifts and hospitality", content: "Never accept cash or cash equivalents such as vouchers from clients or suppliers.", status: "approved", version: 1, effectiveDate: "2025-03-01T00:00:00Z" },
  { id: "remote@1#0", docId: "remote", title: "Remote working", content: "Staff may work remotely up to three days a week with their manager's agreement.", status: "revoked", version: 1, effectiveDate: "2024-01-01T00:00:00Z" },
  { id: "remote@2#0", docId: "remote", title: "Remote working", content: "Staff may work remotely up to two days a week. Working abroad needs HR approval in advance.", status: "approved", version: 2, effectiveDate: "2025-09-01T00:00:00Z" },
  { id: "security@1#0", docId: "security", title: "Information security", content: "Report lost laptops or phones to the service desk within one hour. Error code ERR-4021 means your device certificate has expired.", status: "approved", version: 1, effectiveDate: "2025-01-01T00:00:00Z" },
  { id: "security@1#1", docId: "security", title: "Information security", content: "Use the company password manager. Never reuse passwords across systems.", status: "approved", version: 1, effectiveDate: "2025-01-01T00:00:00Z" },
];

export interface EvalCase {
  id: string;
  query: string;
  relevant: Record<string, number>;
}

/** Relevance labels refer to chunk IDs; only approved, current chunks are labelled relevant. */
export const evalCases: EvalCase[] = [
  { id: "q-business", query: "Can I fly business class?", relevant: { "travel@2#0": 3 } },
  { id: "q-hotel", query: "What is the hotel limit in London?", relevant: { "travel@2#1": 3 } },
  { id: "q-receipts", query: "Do I need receipts for my expenses?", relevant: { "expenses@1#0": 3 } },
  { id: "q-entertain", query: "Who approves expensive client dinners?", relevant: { "expenses@1#1": 3 } },
  { id: "q-gift", query: "A supplier sent me a present, what should I do?", relevant: { "gifts@1#0": 3, "gifts@1#1": 1 } },
  { id: "q-voucher", query: "Can I accept an Amazon voucher from a client?", relevant: { "gifts@1#1": 3 } },
  { id: "q-remote", query: "How many days can I work from home?", relevant: { "remote@2#0": 3 } },
  { id: "q-abroad", query: "Can I work from another country for a month?", relevant: { "remote@2#0": 2 } },
  { id: "q-err", query: "ERR-4021", relevant: { "security@1#0": 3 } },
  { id: "q-laptop", query: "I lost my work laptop", relevant: { "security@1#0": 3 } },
];
