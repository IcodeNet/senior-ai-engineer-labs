import {it,expect} from 'vitest';
import {reviewPaths} from './policy.js';
it('reviews infrastructure cleanup',()=>expect(reviewPaths(['infra/search.bicep']).length).toBe(1));
it('allows normal application changes',()=>expect(reviewPaths(['apps/api/src/app.ts'])).toEqual([]));
it('flags agent rules',()=>expect(reviewPaths(['AGENTS.md'])[0]?.rule).toBe('agent-policy-review'));
it('flags engine pin changes',()=>expect(reviewPaths(['course/icode/engine.json'])[0]?.rule).toBe('engine-pin-review'));
it('flags teaching code outside the Icode course',()=>expect(reviewPaths(['labs/02-x/solution/index.ts','labs/02-x/metrics.test.ts','labs/02-x/README.md','labs/01/infra/main.bicep']).map(f=>f.file)).toEqual(['labs/02-x/solution/index.ts','labs/02-x/metrics.test.ts']));
