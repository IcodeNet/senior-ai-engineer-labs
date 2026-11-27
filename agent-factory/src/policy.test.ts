import {it,expect} from 'vitest';
import {reviewPaths} from './policy.js';
it('reviews infrastructure cleanup',()=>expect(reviewPaths(['infra/search.bicep']).length).toBe(1));
it('allows normal application changes',()=>expect(reviewPaths(['course/exercises/01/README.md'])).toEqual([]));
it('flags agent rules',()=>expect(reviewPaths(['AGENTS.md'])[0]?.rule).toBe('agent-policy-review'));
it('flags engine pin changes',()=>expect(reviewPaths(['course/icode/engine.json'])[0]?.rule).toBe('engine-pin-review'));
it('flags teaching code outside the Icode course',()=>expect(reviewPaths(['labs/02-x/solution/index.ts','src/metrics.test.ts','docs/notes.md','course/exercises/01/solution/index.test.ts','agent-factory/src/course.test.ts']).map(f=>f.file)).toEqual(['labs/02-x/solution/index.ts','src/metrics.test.ts']));
