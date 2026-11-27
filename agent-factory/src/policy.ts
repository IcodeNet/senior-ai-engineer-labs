export type Finding = { rule: string; severity: 'warning'; file: string; message: string };
export function reviewPaths(paths: string[]): Finding[] {
 const findings: Finding[] = [];
 if (paths.some(p => p.startsWith('infra/') && /\.(bicep|tf|ya?ml)$/.test(p))) findings.push({rule:'cloud-cleanup-review',severity:'warning',file:'infra/',message:'Verify scoped cleanup is documented for infrastructure changes.'});
 if (paths.includes('AGENTS.md')) findings.push({rule:'agent-policy-review',severity:'warning',file:'AGENTS.md',message:'Human approval required for changes to agent rules.'});
 if (paths.includes('course/icode/engine.json')) findings.push({rule:'engine-pin-review',severity:'warning',file:'course/icode/engine.json',message:'Icode engine pin changed: the course CI job must pass on this exact commit before relying on it.'});
 for (const p of paths.filter(p => !p.startsWith('course/') && !p.startsWith('agent-factory/') && /(^|\/)(problem|solution)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(p)))
  findings.push({rule:'teach-through-icode',severity:'warning',file:p,message:'Teaching exercises belong in the Icode course (course/exercises); teach only through Icode Workshop.'});
 return findings;
}
