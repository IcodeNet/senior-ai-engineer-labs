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

/** The rank of a known level, or undefined for anything else (wrong case, unknown name): unknown never grants. */
function rank(level: string): number | undefined {
  return Object.hasOwn(CLEARANCE_RANK, level) ? CLEARANCE_RANK[level as Classification] : undefined;
}

export function canRead(principal: Principal, doc: SecuredDocument): Decision {
  if (!principal.tenantId || principal.tenantId !== doc.tenantId) return { allow: false, reason: "tenant" };
  const users = doc.acl?.users ?? [];
  const groups = doc.acl?.groups ?? [];
  if (users.length === 0 && groups.length === 0) return { allow: false, reason: "no-acl" };
  const listed = users.includes(principal.userId) || groups.some((group) => principal.groups.includes(group));
  if (!listed) return { allow: false, reason: "not-listed" };
  const required = rank(doc.classification);
  const held = rank(principal.clearance);
  if (required === undefined || held === undefined || required > held) return { allow: false, reason: "clearance" };
  return { allow: true };
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildSecurityFilter(principal: Principal): string {
  if (!principal.tenantId) throw new Error("principal has no tenant");
  if (rank(principal.clearance) === undefined) throw new Error(`unknown clearance ${principal.clearance}`);
  const grants = [`aclUsers/any(u: u eq ${quote(principal.userId)})`];
  for (const group of [...principal.groups].sort()) grants.push(`aclGroups/any(g: g eq ${quote(group)})`);
  const allowed = (Object.keys(CLEARANCE_RANK) as Classification[]).filter(
    (level) => CLEARANCE_RANK[level] <= CLEARANCE_RANK[principal.clearance],
  );
  const levels = allowed.map((level) => `classification eq ${quote(level)}`).join(" or ");
  return `tenantId eq ${quote(principal.tenantId)} and (${grants.join(" or ")}) and (${levels})`;
}

export function authorizeResults<T extends SecuredDocument>(
  principal: Principal,
  docs: T[],
): { allowed: T[]; denied: { id: string; reason: string }[] } {
  const allowed: T[] = [];
  const denied: { id: string; reason: string }[] = [];
  for (const doc of docs) {
    const decision = canRead(principal, doc);
    if (decision.allow) allowed.push(doc);
    else denied.push({ id: doc.id, reason: decision.reason });
  }
  return { allowed, denied };
}
