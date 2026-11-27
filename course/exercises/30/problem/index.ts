export type Classification = "public" | "internal" | "confidential" | "restricted";

export interface Principal {
  userId: string;
  tenantId: string;
  groups: string[];
  clearance: Classification;
}

export interface SecuredDocument {
  id: string;
  tenantId: string;
  classification: Classification;
  /** Users and groups allowed to read. Missing or empty lists grant nothing. */
  acl?: { users?: string[]; groups?: string[] };
}

export type Decision = { allow: true } | { allow: false; reason: "tenant" | "no-acl" | "not-listed" | "clearance" };

export const CLEARANCE_RANK: Record<Classification, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };

export function canRead(principal: Principal, doc: SecuredDocument): Decision {
  // TODO: deny on tenant mismatch, empty ACL, unlisted principal or insufficient clearance; otherwise allow.
  throw new Error("Not implemented: canRead");
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildSecurityFilter(principal: Principal): string {
  // TODO: tenant, user/group ACL grants and allowed classifications as one OData filter; escape quotes.
  throw new Error("Not implemented: buildSecurityFilter");
}

export function authorizeResults<T extends SecuredDocument>(
  principal: Principal,
  docs: T[],
): { allowed: T[]; denied: { id: string; reason: string }[] } {
  // TODO: split documents into allowed and denied (with reasons) using canRead.
  throw new Error("Not implemented: authorizeResults");
}
