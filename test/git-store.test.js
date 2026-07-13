import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GitStore } from '../src/git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

const run = promisify(execFile)

test('isClone devolve false quando o diretório não é um repositório', async (t) => {
  const dir = await tmpHome(t)
  assert.equal(await new GitStore(path.join(dir, 'repo')).isClone(), false)
})

test('head devolve o SHA curto do commit atual', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })

  const store = new GitStore(repo)
  assert.equal(await store.isClone(), true)
  assert.match(await store.head(), /^[0-9a-f]{7,}$/)
})

test('locallyModified lista os arquivos alterados na cópia de trabalho', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'modificado')

  assert.deepEqual(await new GitStore(repo).locallyModified(), ['a.txt'])
})

test('locallyModified devolve vazio numa árvore limpa', async (t) => {
  const repo = await tmpHome(t)
  await run('git', ['init', '-q'], { cwd: repo })
  await writeFile(path.join(repo, 'a.txt'), 'x')
  await run('git', ['add', '.'], { cwd: repo })
  await run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: repo })

  assert.deepEqual(await new GitStore(repo).locallyModified(), [])
})
