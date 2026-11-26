export type Finding = { rule: string; severity: 'warning'; file: string; message: string };
export function reviewPaths(paths: string[]): Finding[] {
 const findings: Finding[] = [];
 if (paths.some(p => p.startsWith('infra/') && /\.(bicep|tf|ya?ml)$/.test(p))) findings.push({rule:'cloud-cleanup-review',severity:'warning',file:'infra/',message:'Verify scoped cleanup is documented for infrastructure changes.'});
 if (paths.includes('AGENTS.md')) findings.push({rule:'agent-policy-review',severity:'warning',file:'AGENTS.md',message:'Human approval required for changes to agent rules.'});
 return findings;
}
