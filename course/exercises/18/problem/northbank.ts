// The Northbank schema and governance filter from Module 2 (steps 11 and 12), and the synthetic Northbank FAQ corpus.
// You do not need to change this file.

export type Status = "draft" | "approved" | "retired";

export interface Field {
  name: string;
  type: string;
  key?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  retrievable?: boolean;
  sortable?: boolean;
  facetable?: boolean;
  analyzer?: string | null;
  dimensions?: number;
  vectorSearchProfile?: string;
}

export interface VectorSearch {
  algorithms: { name: string; kind: string; hnswParameters?: Record<string, unknown>; exhaustiveKnnParameters?: Record<string, unknown> }[];
  profiles: { name: string; algorithm: string; vectorizer?: string; compression?: string }[];
  vectorizers?: { name: string; kind: string; azureOpenAIParameters?: Record<string, unknown> }[];
  compressions?: { name: string; kind: string }[];
}

export interface IndexDefinition {
  name: string;
  description?: string;
  fields: Field[];
  vectorSearch?: VectorSearch;
}

/** One FAQ answer as the content team publishes it, already split into chunks. */
export interface FaqSource {
  sourceUri: string;
  title: string;
  chunks: string[];
  status: Status;
  /** YYYY-MM-DD */
  effectiveDate: string;
  /** YYYY-MM-DD, or undefined when the answer has no end date. */
  expiryDate?: string;
}

export type SearchDocument = {
  "@search.action": "mergeOrUpload";
  id: string;
  title: string;
  chunk: string;
  sourceUri: string;
  status: Status;
  effectiveDate: string;
  expiryDate: string | null;
};

export const INDEX_NAME = "northbank-faq-v1";
export const STATUSES: readonly Status[] = ["draft", "approved", "retired"];

export const isVector = (type: string) => type === "Collection(Edm.Single)";

export function northbankIndex(dimensions: number, name = INDEX_NAME): IndexDefinition {
  const plain = (name: string, type: string, searchable: boolean, filterable: boolean, sortable: boolean, facetable: boolean): Field => ({
    name,
    type,
    searchable,
    filterable,
    retrievable: true,
    sortable,
    facetable,
  });
  return {
    name,
    description: "Northbank Support FAQ chunks. Only status 'approved' and in-date chunks may be sent to a model.",
    fields: [
      { ...plain("id", "Edm.String", false, true, false, false), key: true },
      plain("title", "Edm.String", true, false, false, false),
      plain("chunk", "Edm.String", true, false, false, false),
      plain("sourceUri", "Edm.String", false, true, false, false),
      plain("status", "Edm.String", false, true, false, true),
      plain("effectiveDate", "Edm.DateTimeOffset", false, true, true, false),
      plain("expiryDate", "Edm.DateTimeOffset", false, true, true, false),
      { name: "contentVector", type: "Collection(Edm.Single)", searchable: true, retrievable: false, dimensions, vectorSearchProfile: "northbank-vector-profile" },
    ],
    vectorSearch: {
      algorithms: [{ name: "northbank-hnsw", kind: "hnsw" }],
      profiles: [{ name: "northbank-vector-profile", algorithm: "northbank-hnsw" }],
    },
  };
}

/** A stable, URL-safe key per chunk: base64url of "<sourceUri>#<chunkIndex>". */
export function documentKey(sourceUri: string, chunkIndex: number): string {
  if (!sourceUri) throw new Error("sourceUri is required");
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error("chunkIndex must be a non-negative integer");
  const key = Buffer.from(`${sourceUri}#${chunkIndex}`, "utf8").toString("base64url");
  if (key.length > 1024) throw new Error("document key longer than 1024 characters");
  return key;
}

function isoDate(value: string, label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a real YYYY-MM-DD date: ${value}`);
  return `${value}T00:00:00Z`;
}

export function toSearchDocuments(source: FaqSource): SearchDocument[] {
  if (!STATUSES.includes(source.status)) throw new Error(`unknown status: ${source.status}`);
  if (source.chunks.length === 0) throw new Error("a source needs at least one chunk");
  const effectiveDate = isoDate(source.effectiveDate, "effectiveDate");
  const expiryDate = source.expiryDate === undefined ? null : isoDate(source.expiryDate, "expiryDate");
  if (expiryDate !== null && expiryDate < effectiveDate) throw new Error("expiryDate is before effectiveDate");
  return source.chunks.map((chunk, i) => ({
    "@search.action": "mergeOrUpload",
    id: documentKey(source.sourceUri, i),
    title: source.title,
    chunk,
    sourceUri: source.sourceUri,
    status: source.status,
    effectiveDate,
    expiryDate,
  }));
}

/** The filter that keeps drafts, retired and out-of-date answers out of every query. `asOf` is YYYY-MM-DD. */
export function governanceFilter(asOf: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) throw new Error(`asOf must be YYYY-MM-DD: ${asOf}`);
  const at = `${asOf}T00:00:00Z`;
  return `status eq 'approved' and effectiveDate le ${at} and (expiryDate eq null or expiryDate ge ${at})`;
}

/** Combine the governance filter with an optional caller filter, so that no caller filter can widen it. */
export function withGovernance(callerFilter: string | undefined, asOf: string): string {
  const governance = governanceFilter(asOf);
  if (callerFilter === undefined || callerFilter.trim() === "") return governance;
  return `(${governance}) and (${callerFilter})`;
}

const FAQ = "https://support.northbank.example/faq";
/** Synthetic Northbank Support answers. Two are not approved and one is not yet in force: they must never reach a model. */
export const NORTHBANK: FaqSource[] = [
  {
    sourceUri: `${FAQ}/overdraft-fees`,
    title: "Overdraft fees",
    chunks: [
      "An arranged overdraft costs 39.9% EAR variable. Interest is charged daily on the overdrawn balance and taken monthly.",
      "There is no fee for an unarranged overdraft. Payments that would take you past your limit are returned unpaid, free of charge.",
    ],
    status: "approved",
    effectiveDate: "2026-02-01",
  },
  {
    sourceUri: `${FAQ}/card-lost-or-stolen`,
    title: "Lost or stolen card",
    chunks: [
      "Freeze your card straight away in the app under Cards, then Freeze. Unfreezing is instant if you find it.",
      "To report a card stolen, call 0800 000 0101 at any time. We cancel the card and send a replacement within three working days.",
    ],
    status: "approved",
    effectiveDate: "2025-06-01",
  },
  {
    sourceUri: `${FAQ}/international-payments`,
    title: "Sending money abroad",
    chunks: [
      "International payments in euros to SEPA countries are free and usually arrive the next working day.",
      "Payments in other currencies cost a flat fee of 5 pounds plus the exchange-rate margin shown before you confirm.",
    ],
    status: "approved",
    effectiveDate: "2026-01-15",
    expiryDate: "2026-12-31",
  },
  {
    sourceUri: `${FAQ}/isa-allowance`,
    title: "ISA allowance",
    chunks: ["You can pay up to 20,000 pounds into ISAs in each tax year, across all your ISAs. Transfers in from other providers do not count towards it."],
    status: "approved",
    effectiveDate: "2026-04-06",
  },
  {
    sourceUri: `${FAQ}/mortgage-overpayments`,
    title: "Mortgage overpayments",
    chunks: ["You can overpay up to 10% of your mortgage balance each year without an early repayment charge. Overpay in the app under Mortgage, then Overpay."],
    status: "approved",
    effectiveDate: "2025-09-01",
  },
  {
    sourceUri: `${FAQ}/chargeback-disputes`,
    title: "Disputing a card payment",
    chunks: ["If a retailer will not refund you, raise a dispute in the app within 120 days of the payment. We may make a temporary credit while we investigate."],
    status: "approved",
    effectiveDate: "2026-03-01",
  },
  {
    sourceUri: `${FAQ}/overdraft-fees-2027`,
    title: "Overdraft fees from 2027 (draft)",
    chunks: ["DRAFT: from 2027 an arranged overdraft will cost 35.0% EAR variable. Not yet approved; do not quote."],
    status: "draft",
    effectiveDate: "2027-01-01",
  },
  {
    sourceUri: `${FAQ}/paper-statements`,
    title: "Paper statements",
    chunks: ["Paper statements cost 2 pounds each. This answer was retired when paper statements became free."],
    status: "retired",
    effectiveDate: "2023-01-01",
    expiryDate: "2025-12-31",
  },
  {
    sourceUri: `${FAQ}/savings-rate-2027`,
    title: "Easy Saver rate from February 2027",
    chunks: ["From 1 February 2027 the Easy Saver account pays 3.10% AER variable on all balances."],
    status: "approved",
    effectiveDate: "2027-02-01",
  },
];

/** Every chunk of the corpus as an index action. */
export const NORTHBANK_DOCUMENTS: SearchDocument[] = NORTHBANK.flatMap(toSearchDocuments);
