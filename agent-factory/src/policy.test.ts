import {it,expect} from 'vitest';
import {reviewPaths} from './policy.js';
it('reviews infrastructure cleanup',()=>expect(reviewPaths(['infra/search.bicep']).length).toBe(1));
it('allows normal application changes',()=>expect(reviewPaths(['apps/api/src/app.ts'])).toEqual([]));
it('flags agent rules',()=>expect(reviewPaths(['AGENTS.md'])[0]?.rule).toBe('agent-policy-review'));
