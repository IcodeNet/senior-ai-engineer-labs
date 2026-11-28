import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewCourse } from './course.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

const lab = { schemaVersion: 1, title: 'T', runtime: 'node', entry: 'index.ts', testScript: 'test', testArgs: ['--run'] };
const pkg = { private: true, type: 'module', scripts: { test: 'vitest' } };
function step(overrides: Record<string, string | object | null> = {}) {
  const files: Record<string, string | object | null> = {
    'lab.json': lab,
    'README.md': '# Lesson\n\n## Interview question\n> Why?\n',
    'problem/package.json': pkg,
    'solution/package.json': pkg,
    'problem/index.ts': 'export const f = () => { throw new Error("Not implemented: f"); };\n',
    'solution/index.ts': 'export const f = () => 1;\n',
    'problem/index.test.ts': 'test\n',
    'solution/index.test.ts': 'test\n',
    ...overrides,
  };
  return files;
}
function course(steps: Record<string, ReturnType<typeof step>>, listed = Object.keys(steps)) {
  const root = mkdtempSync(join(tmpdir(), 'factory-course-'));
  roots.push(root);
  const write = (path: string, content: string | object) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
  };
  write('course/course.json', { schemaVersion: 1, title: 'C', modules: [{ id: 'm', title: 'M', exercises: [{ id: 'e', title: 'E', steps: listed }] }] });
  for (const [id, files] of Object.entries(steps))
    for (const [path, content] of Object.entries(files)) if (content !== null) write(`course/exercises/${id}/${path}`, content);
  return root;
}
const rules = (root: string) => reviewCourse(root).map(f => `${f.rule} ${f.file}`);

it('a well-formed course has no findings', () => {
  expect(reviewCourse(course({ '01': step(), '02': step() }))).toEqual([]);
});

it('a repository without a course is not reviewed', () => {
  const root = mkdtempSync(join(tmpdir(), 'factory-empty-'));
  roots.push(root);
  expect(reviewCourse(root)).toEqual([]);
});

it('flags unregistered, missing, duplicate and out-of-order steps', () => {
  const root = course({ '01': step(), '02': step(), '03': step() }, ['02', '01', '01', '04']);
  expect(rules(root)).toEqual([
    'course-step-registration course/course.json',
    'course-step-registration course/course.json',
    'course-step-registration course/exercises/03',
    'course-step-registration course/course.json',
  ]);
});

it('flags tests that differ between problem and solution, and missing files', () => {
  const root = course({ '01': step({ 'problem/index.test.ts': 'weakened\n', 'solution/fixtures.ts': 'x' }) });
  expect(rules(root)).toEqual(['course-variant-parity course/exercises/01', 'course-variant-parity course/exercises/01/problem/index.test.ts']);
});

it('flags starters that do not fail on stubs and solutions that still contain them', () => {
  const root = course({
    '01': step({ 'problem/index.ts': 'export const f = () => 1;\n' }),
    '02': step({ 'solution/index.ts': '// TODO\n' }),
  });
  expect(rules(root)).toEqual([
    'course-starter course/exercises/01/problem/index.ts',
    'course-starter course/exercises/01/problem/index.ts',
    'course-solution course/exercises/02/solution/index.ts',
  ]);
});

it('flags the wrong test runner and lessons without an interview question', () => {
  const root = course({
    '01': step({ 'lab.json': { ...lab, testScript: undefined, testArgs: undefined }, 'README.md': '# Lesson only\n' }),
    '02': step({ 'solution/package.json': { scripts: { test: 'node --test' } } }),
  });
  expect(rules(root)).toEqual([
    'course-test-runner course/exercises/01/lab.json',
    'course-lesson course/exercises/01/README.md',
    'course-variant-parity course/exercises/02/problem/package.json',
    'course-test-runner course/exercises/02/solution/package.json',
  ]);
});

it('flags files and folders outside lab.json, README.md, problem/ and solution/ in a step', () => {
  const root = course({ '01': step({ 'index.ts': 'export const f = () => 1;\n', 'notes/todo.md': 'x' }), '02': step() });
  mkdirSync(join(root, 'course/exercises/02/node_modules/.vite'), { recursive: true });
  mkdirSync(join(root, 'course/exercises/02/solution/node_modules/.vite'), { recursive: true });
  expect(rules(root)).toEqual(['course-step-layout course/exercises/01/index.ts', 'course-step-layout course/exercises/01/notes']);
});

it('flags dot files and folders anywhere in a step, but not inside node_modules', () => {
  const root = course({
    '01': step({ '.index.ts': 'export const f = () => 1;\n', '.scratch/s.ts': 'x' }),
    '02': step({ 'problem/.solution.ts': 'x', 'solution/.solution.ts': 'x', 'solution/lib/.env': 'KEY=x' }),
    '03': step(),
  });
  writeFileSync(join(root, 'course/exercises/03/.DS_Store'), '');
  writeFileSync(join(root, 'course/exercises/03/.gitkeep'), '');
  mkdirSync(join(root, 'course/exercises/03/problem/node_modules/.vite'), { recursive: true });
  expect(rules(root)).toEqual([
    'course-step-layout course/exercises/01/.index.ts',
    'course-step-layout course/exercises/01/.scratch',
    'course-step-layout course/exercises/02/problem/.solution.ts',
    'course-step-layout course/exercises/02/solution/.solution.ts',
    'course-step-layout course/exercises/02/solution/lib/.env',
    'course-step-layout course/exercises/03/.DS_Store',
    'course-step-layout course/exercises/03/.gitkeep',
  ]);
});

it('the repository course passes its own structural review', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  expect(reviewCourse(repo)).toEqual([]);
});
