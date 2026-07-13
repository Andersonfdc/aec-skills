import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, stat } from 'node:fs/promises'
import { readConfig, writeConfig, readInstalled, writeInstalled } from '../src/state.js'
import { storePaths } from '../src/paths.js'
import { tmpHome } from './helpers/tmp-home.js'

test('readConfig devolve objeto vazio quando o arquivo não existe', async (t) => {
  const home = await tmpHome(t)
  assert.deepEqual(await readConfig(home), {})
})

test('writeConfig e readConfig fazem round-trip', async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { remoteUrl: 'https://github.com/org/lib.git', token: 'segredo' })
  assert.equal((await readConfig(home)).remoteUrl, 'https://github.com/org/lib.git')
})

test('writeConfig grava config.json com permissão 0600', { skip: process.platform === 'win32' }, async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { token: 'segredo' })
  const info = await stat(storePaths(home).configFile)
  assert.equal(info.mode & 0o777, 0o600)
})

test('writeConfig reaperta para 0600 mesmo quando o arquivo já existe com permissão mais aberta', { skip: process.platform === 'win32' }, async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { token: 'segredo' })
  await chmod(storePaths(home).configFile, 0o644)

  await writeConfig(home, { token: 'segredo', lastFetch: 123 })

  const info = await stat(storePaths(home).configFile)
  assert.equal(info.mode & 0o777, 0o600)
})

test('readInstalled devolve lista vazia quando o arquivo não existe', async (t) => {
  const home = await tmpHome(t)
  assert.deepEqual(await readInstalled(home), [])
})

test('writeInstalled e readInstalled fazem round-trip', async (t) => {
  const home = await tmpHome(t)
  const entries = [{
    name: 'code-review', kind: 'skill', harness: 'claude',
    dest: '/h/.claude/skills/code-review', mode: 'link', sha: 'abc1234',
  }]
  await writeInstalled(home, entries)
  assert.deepEqual(await readInstalled(home), entries)
})
