import { cp, mkdir, readdir, rename, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const exercises = join(root, 'exercises')
const playground = join(root, 'playground')
const id = process.argv[3]
const command = process.argv[2]

async function exists(path) {
  try { await stat(path); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function main() {
  if (command === 'list') {
    console.log((await readdir(exercises)).join('\n'))
    return
  }
  if (command === 'set') {
    if (!/^\d{2}$/.test(id ?? '')) throw new Error('Exercise ID must be two digits')
    const source = join(exercises, id, 'problem')
    if (!(await exists(source))) throw new Error('Unknown exercise')
    if (await exists(playground)) {
      const backup = join(root, 'playground.backup-' + new Date().toISOString().replace(/[:.]/g, '-'))
      await rename(playground, backup)
      console.log('Previous work backed up to:', backup)
    }
    await cp(source, playground, { recursive: true, force: false, errorOnExist: true })
    console.log('Playground set to exercise', id)
    return
  }
  if (command === 'test') {
    if (!(await exists(playground))) throw new Error('Set an exercise first')
    const result = spawnSync(process.execPath, ['--test'], { cwd: playground, stdio: 'inherit' })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
    return
  }
  if (command === 'diff') {
    if (!(await exists(playground))) throw new Error('Set an exercise first')
    const solution = join(exercises, '01', 'solution')
    const result = spawnSync('diff', ['-ru', playground, solution], { stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0 && result.status !== 1) process.exitCode = result.status ?? 2
    return
  }
  throw new Error('Usage: node workshop-poc/cli.mjs list|set 01|test|diff')
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
