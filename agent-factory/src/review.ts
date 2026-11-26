import { readFileSync, writeFileSync } from 'node:fs';
import { reviewPaths } from './policy.js';
const filename = process.argv[2];
if (!filename) throw new Error('Provide a changed-paths JSON file');
const paths: unknown = JSON.parse(readFileSync(filename,'utf8'));
if (!Array.isArray(paths) || !paths.every(x=>typeof x==='string')) throw new Error('Expected string array');
const result = {schemaVersion:1,mode:'deterministic-report-only',findings:reviewPaths(paths)};
writeFileSync('agent-review.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
