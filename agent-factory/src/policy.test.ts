import {it,expect} from 'vitest';
import {reviewPaths} from './policy.js';
it('reviews infrastructure cleanup',()=>expect(reviewPaths(['infra/search.bicep']).length).toBe(1));
it('allows normal application changes',()=>expect(reviewPaths(['apps/api/src/app.ts'])).toEqual([]));
it('flags agent rules',()=>expect(reviewPaths(['AGENTS.md'])[0]?.rule).toBe('agent-policy-review'));

it('flags Terraform infrastructure changes',()=>expect(reviewPaths(['infra/main.tf']).map(f=>f.rule)).toContain('cloud-cleanup-review'));
it('does not flag unrelated files',()=>expect(reviewPaths(['README.md','apps/web/src/main.tsx'])).toEqual([]));
it('flags governance changes even alongside app files',()=>expect(reviewPaths(['apps/api/src/app.ts','AGENTS.md']).map(f=>f.rule)).toContain('agent-policy-review'));
