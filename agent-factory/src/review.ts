import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reviewCourse } from './course.js';
import { reviewPaths } from './policy.js';
const filename = process.argv[2];
if (!filename) throw new Error('Provide a changed-paths JSON file');
const root = resolve(process.argv[3] ?? '..');
const paths: unknown = JSON.parse(readFileSync(filename,'utf8'));
if (!Array.isArray(paths) || !paths.every(x=>typeof x==='string')) throw new Error('Expected string array');
const findings = [...reviewPaths(paths), ...reviewCourse(root)];
const result = {schemaVersion:1,mode:'deterministic-report-only',changedPaths:paths.length,findings};
writeFileSync('agent-review.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if (process.env.GITHUB_STEP_SUMMARY) {
 const rows = findings.map(f => `| ${f.rule} | \`${f.file}\` | ${f.message} |`);
 appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`## Agent factory review (report-only)`, ``, `${paths.length} changed paths, ${findings.length} findings.`, ``, ...(rows.length ? ['| Rule | File | Finding |', '|---|---|---|', ...rows] : ['No findings.']), ''].join('\n'));
}
