// Deterministic structural review of the Icode Workshop course, independent of the course's own acceptance script.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from './policy.js';

const STEP = /^\d{2}$/;
const VARIANTS = ['problem', 'solution'] as const;

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

export function reviewCourse(root: string): Finding[] {
  const course = join(root, 'course');
  const findings: Finding[] = [];
  if (!existsSync(join(course, 'course.json'))) return findings;
  const exercises = join(course, 'exercises');
  const onDisk = existsSync(exercises) ? readdirSync(exercises).filter(name => STEP.test(name)).sort() : [];

  let listed: string[] = [];
  try {
    const config = json(join(course, 'course.json')) as { modules?: { exercises?: { steps?: string[] }[] }[] };
    listed = (config.modules ?? []).flatMap(m => (m.exercises ?? []).flatMap(e => e.steps ?? []));
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
    if (!/^# /.test(readme) || !/^## Interview question$/m.test(readme))
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
