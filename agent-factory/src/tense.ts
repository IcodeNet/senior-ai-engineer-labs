// Present tense only: course content and docs describe what exists now, never its history or origins.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from './policy.js';

/** Phrases that tell the reader about history. Each is unambiguous in course text; ordinary uses of words like "replaces" are not flagged. */
export const HISTORY_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bwas Lab \d+/i, label: '"was Lab NN"' },
  { pattern: /\bformerly\b/i, label: '"formerly"' },
  { pattern: /\bformer (?:labs?|lessons?|steps?|modules?|course)\b/i, label: '"former labs"' },
  { pattern: /\brenamed\b/i, label: '"renamed"' },
  { pattern: /\brenumber(?:ed|ing|s)?\b/i, label: '"renumbered"' },
  { pattern: /\bold (?:labs?|lessons?|steps?|course|modules?)\b/i, label: '"old labs"' },
  { pattern: /\bpredecessor\b/i, label: '"predecessor"' },
  { pattern: /\bmoved (?:from|out of)\b/i, label: '"moved from"' },
  { pattern: /\bpreviously\b/i, label: '"previously"' },
  { pattern: /\bfixed in\b/i, label: '"fixed in"' },
  { pattern: /\breplac(?:es|ed) (?:the )?(?:old|previous|earlier|former|original)\b/i, label: '"replaces the old …"' },
  { pattern: /\bnow\b[^.\n]{0,60}\binstead of\b/i, label: '"now … instead of …"' },
  { pattern: /\b(?:pre-redesign|before the redesign)\b/i, label: '"pre-redesign"' },
  { pattern: /\bcommit `?[0-9a-f]{7,40}\b/i, label: 'a reference to an old commit' },
  { pattern: /\bv0-labs\b/, label: 'a reference to an old tag' },
];

const TEXT = /\.(md|mdx|json|ts|tsx|mjs|js|bicep)$/;

function walk(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map(name => name.split('\\').join('/'))
    .filter(name => !name.split('/').some(part => part === 'node_modules' || part.startsWith('.')))
    .filter(name => !name.endsWith('package-lock.json') && TEXT.test(name) && statSync(join(dir, name)).isFile())
    .map(name => `${prefix}/${name}`)
    .sort();
}

/** Repository-relative files the rule reads: the course, docs and the top-level README. */
export function presentTenseFiles(root: string): string[] {
  const top = ['README.md'].filter(name => existsSync(join(root, name)));
  return [...top, ...walk(join(root, 'course'), 'course'), ...walk(join(root, 'docs'), 'docs')];
}

/** One finding per line that names history or origins. */
export function historyFindings(text: string, file: string): Finding[] {
  const findings: Finding[] = [];
  text.split('\n').forEach((line, i) => {
    const hits = HISTORY_PHRASES.filter(p => p.pattern.test(line)).map(p => p.label);
    if (hits.length)
      findings.push({
        rule: 'present-tense',
        severity: 'warning',
        file: `${file}:${i + 1}`,
        message: `Describe what exists now; remove history (${hits.join(', ')}). Name planned work only as a plan.`,
      });
  });
  return findings;
}

export function reviewPresentTense(root: string): Finding[] {
  return presentTenseFiles(root).flatMap(file => historyFindings(readFileSync(join(root, file), 'utf8'), file));
}
