import test from 'node:test'
import assert from 'node:assert/strict'
import { approvedOnly } from './index.mjs'

test('only approved documents may be returned', () => {
  assert.deepEqual(approvedOnly([
    { id: 'a', status: 'approved' },
    { id: 'b', status: 'draft' }
  ]), [{ id: 'a', status: 'approved' }])
})
