import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { historyFindings, presentTenseFiles, reviewPresentTense } from './tense.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function repo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'factory-tense-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const flagged = [
  'Advanced A1 (was Lab 04)',
  'Formerly the evaluation lab.',
  'The advanced modules (former Labs 04–06) are local.',
  'The step was renamed last week.',
  'Steps were renumbered to 71–94.',
  'See the old labs for chunking.',
  "Module 3's predecessor",
  'This lesson moved from step 09.',
  'Previously the filter ran in the prompt.',
  'The bypass was fixed in PR #12.',
  'This step replaces the old Lab 01 lesson.',
  'The banner now shows a status instead of hiding.',
  'The pre-redesign course covers RRF.',
  'The course is at commit `2ff7c3d`.',
  'Tag v0-labs holds it.',
];

const allowed = [
  '# Approval filters',
  'Filter on the server instead of in the prompt.',
  'Reloading a source replaces its chunks instead of duplicating them.',
  'redact replaces values with typed placeholders',
  'ISO date after which the answer must no longer be used.',
  'Module 7 covers evaluation.',
  'An identical repeated call stops the run instead of looping.',
];

it.each(flagged)('flags history: %s', line => {
  expect(historyFindings(line, 'f.md')).toHaveLength(1);
});

it.each(allowed)('does not flag present-tense text: %s', line => {
  expect(historyFindings(line, 'f.md')).toEqual([]);
});

it('reports the file and line of each finding', () => {
  const [finding] = historyFindings('# Title\n\nFormerly Lab 05.\n', 'course/README.md');
  expect(finding).toMatchObject({ rule: 'present-tense', severity: 'warning', file: 'course/README.md:3' });
  expect(finding.message).toContain('"formerly"');
});

it('reads the course, docs and top-level README, skipping node_modules, dot folders, lockfiles and other trees', () => {
  const root = repo({
    'README.md': 'ok',
    'AGENTS.md': 'Previously',
    'course/README.md': 'ok',
    'course/exercises/01/README.md': 'ok',
    'course/exercises/01/problem/index.test.ts': 'ok',
    'course/exercises/01/problem/node_modules/x/README.md': 'Previously',
    'course/.cache/a.md': 'Previously',
    'course/package-lock.json': '{"previously":1}',
    'docs/PROGRESS.md': 'ok',
    'agent-factory/README.md': 'Previously',
  });
  expect(presentTenseFiles(root)).toEqual([
    'README.md',
    'course/README.md',
    'course/exercises/01/README.md',
    'course/exercises/01/problem/index.test.ts',
    'docs/PROGRESS.md',
  ]);
});

it('a present-tense repository has no findings; history in a lesson, a test name and a doc is flagged', () => {
  expect(reviewPresentTense(repo({ 'course/README.md': 'Module 7 covers evaluation.\n', 'docs/a.md': 'Current status.\n' }))).toEqual([]);
  const root = repo({
    'course/exercises/71/README.md': '# Tools\n\nThis was Lab 04.\n',
    'course/exercises/71/problem/index.test.ts': 'test("previously crashed", () => {});\n',
    'docs/course-step-map.md': '| Old (commit `2ff7c3d`) | New |\n',
  });
  expect(reviewPresentTense(root).map(f => f.file)).toEqual([
    'course/exercises/71/README.md:3',
    'course/exercises/71/problem/index.test.ts:1',
    'docs/course-step-map.md:1',
  ]);
});
