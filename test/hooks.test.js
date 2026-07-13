import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { previewHook, installHook, uninstallHook } from '../src/hooks.js'
import { storePaths } from '../src/paths.js'
import { tmpHome } from './helpers/tmp-home.js'

const FRAGMENT = { hooks: { SessionStart: [{ command: 'aec-skills status' }] } }

async function seedHook(home) {
  const { repo } = storePaths(home)
  const dir = path.join(repo, 'hooks', 'check-updates')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'hook.json'), JSON.stringify(FRAGMENT, null, 2))
  return { kind: 'hook', name: 'check-updates', sourcePath: dir, attrs: {}, body: '', errors: [] }
}

test('previewHook devolve o fragmento e um diff legível', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)

  const { fragment, diff } = await previewHook(home, artifact)

  assert.deepEqual(fragment, FRAGMENT)
  assert.match(diff, /SessionStart/)
  assert.match(diff, /aec-skills status/)
})

test('installHook injeta o hook preservando o settings do usuário', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ model: 'opus', hooks: { SessionStart: [{ command: 'meu-hook' }] } }, null, 2),
  )

  await installHook(home, artifact)

  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'))
  assert.equal(settings.model, 'opus')
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'meu-hook' }, { command: 'aec-skills status' }])
})

test('installHook cria backup antes de escrever', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)
  const settingsFile = path.join(home, '.claude', 'settings.json')
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(settingsFile, JSON.stringify({ model: 'opus' }, null, 2))

  await installHook(home, artifact)

  const backup = JSON.parse(await readFile(`${settingsFile}.bak`, 'utf8'))
  assert.deepEqual(backup, { model: 'opus' })
})

test('installHook funciona quando settings.json não existe', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)

  await installHook(home, artifact)

  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'))
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'aec-skills status' }])
})

test('uninstallHook remove só a nossa entrada', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { SessionStart: [{ command: 'meu-hook' }] } }, null, 2),
  )
  await installHook(home, artifact)

  await uninstallHook(home, artifact)

  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'))
  assert.deepEqual(settings.hooks.SessionStart, [{ command: 'meu-hook' }])
})

test('installHook recusa settings.json inválido sem tocar no arquivo nem criar backup', async (t) => {
  const home = await tmpHome(t)
  const artifact = await seedHook(home)
  const settingsFile = path.join(home, '.claude', 'settings.json')
  await mkdir(path.join(home, '.claude'), { recursive: true })
  await writeFile(settingsFile, '{ not valid json')

  await assert.rejects(() => installHook(home, artifact), /JSON inválido/)

  assert.equal(await readFile(settingsFile, 'utf8'), '{ not valid json')
  await assert.rejects(() => readFile(`${settingsFile}.bak`, 'utf8'), { code: 'ENOENT' })
})
