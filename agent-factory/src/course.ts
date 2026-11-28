// Deterministic structural review of the Icode Workshop course, independent of the course's own acceptance script.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Finding } from './policy.js';

const STEP = /^\d{2}$/;
const VARIANTS = ['problem', 'solution'] as const;
const STEP_ENTRIES = ['README.md', 'lab.json', 'problem', 'solution'];
/** Foundation modules (Modules 0–11) are registered as `module-NN-…`; their lessons follow the step template. */
const FOUNDATION_MODULE = /^module-\d{2}(-|$)/;
export const TEMPLATE_SECTIONS = ['Concept', 'Theory', 'Check questions', 'Hands-on', 'Recap and next'];
const QUESTION_KEYS = new Set(['prompt', 'options', 'answer', 'explanation', 'source']);

function warn(rule: string, file: string, message: string): Finding {
  return { rule, severity: 'warning', file, message };
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(name => !name.split(/[\\/]/).some(part => part === 'node_modules' || part.startsWith('.')))
    .filter(name => statSync(join(dir, name)).isFile())
    .map(name => name.split('\\').join('/'))
    .sort();
}

/** The outermost dot files and folders under `dir`, relative to it, skipping node_modules. */
function hiddenEntries(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name === 'node_modules') continue;
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.name.startsWith('.')) found.push(path);
    else if (entry.isDirectory()) found.push(...hiddenEntries(dir, path));
  }
  return found;
}

type CourseConfig = { modules?: { id?: string; exercises?: { steps?: string[] }[] }[] };

/**
 * Steps the step-template rule applies to: every step of every foundation module (`module-NN-…`), Modules 0–11,
 * including the live Azure modules 3 and 4.
 */
export function foundationSteps(config: CourseConfig): string[] {
  return (config.modules ?? [])
    .filter(m => typeof m.id === 'string' && FOUNDATION_MODULE.test(m.id))
    .flatMap(m => (m.exercises ?? []).flatMap(e => e.steps ?? []));
}

export function reviewCourse(root: string): Finding[] {
  const course = join(root, 'course');
  const findings: Finding[] = [];
  if (!existsSync(join(course, 'course.json'))) return findings;
  const exercises = join(course, 'exercises');
  const onDisk = existsSync(exercises) ? readdirSync(exercises).filter(name => STEP.test(name)).sort() : [];

  let listed: string[] = [];
  let foundation = new Set<string>();
  try {
    const config = json(join(course, 'course.json')) as CourseConfig;
    listed = (config.modules ?? []).flatMap(m => (m.exercises ?? []).flatMap(e => e.steps ?? []));
    foundation = new Set(foundationSteps(config));
  } catch {
    return [warn('course-config', 'course/course.json', 'course.json is not valid JSON.')];
  }
  const seen = new Set<string>();
  for (const id of listed) {
    if (seen.has(id)) findings.push(warn('course-step-registration', 'course/course.json', `Step ${id} is listed more than once.`));
    seen.add(id);
    if (!onDisk.includes(id)) findings.push(warn('course-step-registration', 'course/course.json', `Step ${id} is listed but course/exercises/${id} does not exist.`));
  }
  for (const id of onDisk)
    if (!seen.has(id)) findings.push(warn('course-step-registration', `course/exercises/${id}`, `Step ${id} exists but is not listed in course.json.`));
  if (listed.join() !== [...listed].sort().join())
    findings.push(warn('course-step-registration', 'course/course.json', 'Steps are not listed in ascending order.'));

  for (const id of onDisk) {
    const base = join(exercises, id);
    const rel = `course/exercises/${id}`;
    // Only the lesson, its config and the two variants belong in a step; node_modules is the only local artefact.
    for (const name of readdirSync(base).sort())
      if (!STEP_ENTRIES.includes(name) && name !== 'node_modules' && !name.startsWith('.'))
        findings.push(warn('course-step-layout', `${rel}/${name}`, `Unexpected ${name} in a step; a step contains only lab.json, README.md, problem/ and solution/.`));
    // Dot entries anywhere in a step (outside node_modules) are flagged too: a hidden ".index.ts" or ".scratch/" would
    // otherwise slip past both this rule and variant parity. No step on main needs one, so there is no allowlist.
    for (const path of hiddenEntries(base))
      findings.push(warn('course-step-layout', `${rel}/${path}`, `Unexpected hidden ${path} in a step; dot files and folders do not belong in a step.`));
    let entry = 'index.ts';
    try {
      const lab = json(join(base, 'lab.json')) as { entry?: string; testScript?: string; testArgs?: unknown };
      entry = lab.entry ?? entry;
      if (lab.testScript !== 'test' || JSON.stringify(lab.testArgs) !== '["--run"]')
        findings.push(warn('course-test-runner', `${rel}/lab.json`, 'lab.json must run the Vitest package script: "testScript": "test", "testArgs": ["--run"].'));
    } catch {
      findings.push(warn('course-config', `${rel}/lab.json`, 'lab.json is missing or not valid JSON.'));
    }
    const readme = existsSync(join(base, 'README.md')) ? readFileSync(join(base, 'README.md'), 'utf8') : '';
    if (foundation.has(id)) findings.push(...reviewTemplate(readme, `${rel}/README.md`));
    else if (!/^# /.test(readme) || !/^## Interview question$/m.test(readme))
      findings.push(warn('course-lesson', `${rel}/README.md`, 'Lesson README needs a title and an "## Interview question" section.'));

    const [problem, solution] = VARIANTS.map(v => files(join(base, v)));
    if (problem.join() !== solution.join())
      findings.push(warn('course-variant-parity', rel, 'problem/ and solution/ must contain the same files.'));
    for (const name of solution.filter(n => n !== entry && problem.includes(n)))
      if (readFileSync(join(base, 'problem', name), 'utf8') !== readFileSync(join(base, 'solution', name), 'utf8'))
        findings.push(warn('course-variant-parity', `${rel}/problem/${name}`, `${name} differs between problem and solution; only ${entry} may differ.`));
    for (const variant of VARIANTS) {
      try {
        const pkg = json(join(base, variant, 'package.json')) as { scripts?: Record<string, string> };
        if (pkg.scripts?.test !== 'vitest')
          findings.push(warn('course-test-runner', `${rel}/${variant}/package.json`, 'The test script must be "vitest".'));
      } catch {
        findings.push(warn('course-test-runner', `${rel}/${variant}/package.json`, 'package.json is missing or not valid JSON.'));
      }
    }
    const starter = existsSync(join(base, 'problem', entry)) ? readFileSync(join(base, 'problem', entry), 'utf8') : '';
    const reference = existsSync(join(base, 'solution', entry)) ? readFileSync(join(base, 'solution', entry), 'utf8') : '';
    if (!starter.includes('Not implemented'))
      findings.push(warn('course-starter', `${rel}/problem/${entry}`, 'Starter should fail on "Not implemented" errors, not on setup.'));
    if (/Not implemented|TODO/.test(reference))
      findings.push(warn('course-solution', `${rel}/solution/${entry}`, 'Reference solution still contains a stub or TODO.'));
    if (starter !== '' && starter === reference)
      findings.push(warn('course-starter', `${rel}/problem/${entry}`, 'Starter is identical to the solution.'));
  }
  return findings;
}

/** Problems with one fenced `question` block, or an empty list when it is valid. */
export function questionProblems(source: string): string[] {
  let data: unknown;
  try {
    data = parse(source);
  } catch (error) {
    return [`is not valid YAML (${(error as Error).message.split('\n')[0]})`];
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return ['must be a YAML mapping'];
  const q = data as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of Object.keys(q)) if (!QUESTION_KEYS.has(key)) problems.push(`has an unknown key "${key}"`);
  for (const key of ['prompt', 'answer', 'explanation'])
    if (typeof q[key] !== 'string' || !(q[key] as string).trim()) problems.push(`needs a non-empty "${key}"`);
  if (q.options !== undefined) {
    const options = q.options;
    if (!Array.isArray(options) || options.length < 2 || !options.every(o => typeof o === 'string' && o.trim()))
      problems.push('"options" must list at least two non-empty strings');
    else if (new Set(options).size !== options.length) problems.push('"options" must not repeat');
    else if (typeof q.answer === 'string' && !options.includes(q.answer)) problems.push('"answer" must be one of the options, word for word');
  }
  if (q.source !== undefined && q.source !== 'handoff') problems.push('"source" may only be "handoff"');
  return problems;
}

/** Foundation lessons: the five template sections in order, and 3–5 valid `question` blocks under "Check questions". */
export function reviewTemplate(readme: string, file: string): Finding[] {
  const findings: Finding[] = [];
  if (!/^# /.test(readme)) findings.push(warn('course-lesson-template', file, 'Lesson README needs a "# " title.'));
  const headings = [...readme.matchAll(/^## (.+?)\s*$/gm)].map(m => m[1]);
  const positions = TEMPLATE_SECTIONS.map(s => headings.indexOf(s));
  const missing = TEMPLATE_SECTIONS.filter((_, i) => positions[i] === -1);
  if (missing.length) findings.push(warn('course-lesson-template', file, `Lesson is missing the step-template section(s): ${missing.map(s => `"## ${s}"`).join(', ')}.`));
  else if (positions.some((p, i) => i > 0 && p < positions[i - 1]))
    findings.push(warn('course-lesson-template', file, `Step-template sections must appear in order: ${TEMPLATE_SECTIONS.join(', ')}.`));
  const start = readme.search(/^## Check questions\s*$/m);
  if (start === -1) return findings;
  const rest = readme.slice(start).replace(/^## Check questions\s*$/m, '');
  const next = rest.search(/^## /m);
  const section = next === -1 ? rest : rest.slice(0, next);
  const blocks = [...section.matchAll(/^```question[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map(m => m[1]);
  let valid = 0;
  blocks.forEach((block, i) => {
    const problems = questionProblems(block);
    if (problems.length) findings.push(warn('course-check-questions', file, `Check question ${i + 1} ${problems.join('; ')}.`));
    else valid++;
  });
  if (valid < 3 || blocks.length > 5)
    findings.push(warn('course-check-questions', file, `"## Check questions" needs 3–5 valid \`question\` blocks; found ${valid} valid of ${blocks.length}.`));
  return findings;
}
