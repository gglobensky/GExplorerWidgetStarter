import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TreeController, key, within, minimizeOthers, newState } from '../tree.ts'
import { createFixtures } from '../preview/fixtures.ts'

async function until(fn: () => boolean) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 3)) }
  assert.ok(fn(), 'condition did not settle')
}
test('filesystem identity respects root boundaries and POSIX case', () => {
  assert.equal(key('C:\\Work\\'), 'c:/work')
  assert.ok(within('C:\\Work\\a', 'c:/work/'))
  assert.ok(!within('C:/Workspace', 'C:/Work'))
  assert.ok(within('//SERVER/share/a', '\\\\server\\share'))
  assert.ok(!within('/Work/a', '/work'))
  assert.deepEqual(minimizeOthers(['C:/A', 'C:/A/B', 'C:/A/B/C', 'C:/A/D', 'C:/AA'], 'C:/A/B'), ['C:/A', 'C:/A/B', 'C:/A/B/C'])
})
test('expansion is lazy, collapse closes descendants, and reopen restores their state', async () => {
  let open = 0
  const tree = new TreeController(createFixtures(() => {}, n => open = n, 1), () => {})
  const state = newState()
  tree.setRoot('C:/Sample work', state)
  await until(() => tree.root?.status === 'ready')
  assert.equal(open, 1)
  assert.equal(tree.rows().length, 7)
  const projects = tree.find('C:/Sample work/Projects')!
  tree.toggle(projects)
  await until(() => projects.status === 'ready')
  const gem = tree.find('C:/Sample work/Projects/GEM')!
  tree.toggle(gem)
  await until(() => gem.status === 'ready')
  assert.equal(open, 3)
  tree.toggle(projects)
  assert.equal(open, 1)
  assert.ok(tree.isExpanded(gem.path))
  tree.toggle(projects)
  await until(() => open === 3 && gem.status === 'ready')
  tree.close(); assert.equal(open, 0)
})
test('large folders load bounded batches; minimize closes watchers without changing another root', async () => {
  let open = 0
  const tree = new TreeController(createFixtures(() => {}, n => open = n, 1), () => {})
  const a = newState(), b = newState()
  b.expanded = ['D:/Sample archive/Backups']
  tree.setRoot('C:/Sample work', a)
  await until(() => tree.root?.status === 'ready')
  const many = tree.find('C:/Sample work/Many folders')!
  tree.toggle(many)
  await until(() => many.status === 'ready')
  assert.deepEqual(tree.levelRows(many).slice(0, 2).map(row => ({ name: row.node.name, depth: row.depth, parent: row.parent })), [
    { name: 'Folder 0001', depth: 1, parent: many.path },
    { name: 'Folder 0002', depth: 1, parent: many.path },
  ])
  assert.equal(many.children.length, 80)
  assert.equal(many.total, 5000)
  assert.ok(tree.rows().some(r => r.type === 'more'))
  tree.more(many)
  await until(() => many.children.length === 160)
  tree.minimize(); assert.equal(open, 1)
  assert.deepEqual(b.expanded, ['D:/Sample archive/Backups'])
  tree.setRoot('D:/Sample archive', b)
  await until(() => open === 2)
  tree.close(); assert.equal(open, 0)
})
test('inline access error can retry and empty folders settle; stale work cannot repopulate a switched root', async () => {
  let open = 0
  const tree = new TreeController(createFixtures(() => {}, n => open = n, 1), () => {})
  tree.setRoot('C:/Sample work', newState())
  await until(() => tree.root?.status === 'ready')
  const denied = tree.find('C:/Sample work/Restricted folder')!
  tree.toggle(denied)
  await until(() => denied.status === 'error')
  assert.ok(tree.rows().some(r => r.type === 'error'))
  tree.retry(denied)
  await until(() => denied.status === 'ready')
  assert.ok(tree.rows().some(r => r.type === 'empty' && r.node === denied))
  tree.toggle(tree.find('C:/Sample work/Slow folder')!)
  tree.setRoot('D:/Sample archive', newState())
  await until(() => tree.root?.status === 'ready')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(open, 1)
  assert.ok(tree.rows().every(r => r.node.path.startsWith('D:/')))
  tree.close(); assert.equal(open, 0)
})
