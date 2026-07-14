import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { isLegacyRemote, migrateLegacyStore } from '../src/migrate.js'
import { runCli } from '../src/cli.js'
import { storePaths } from '../src/paths.js'
import { readConfig, writeConfig } from '../src/state.js'
import { DEFAULT_REMOTE_URL } from '../src/constants.js'
import { tmpHome } from './helpers/tmp-home.js'

const LEGACY = 'https://github.com/Andersonfdc/aec-skills.git'

test('reconhece a URL do monorepo como legado', () => {
  assert.equal(isLegacyRemote(LEGACY), true)
})

test('reconhece o legado independente de .git, barra final e caixa', () => {
  assert.equal(isLegacyRemote('https://github.com/Andersonfdc/aec-skills'), true)
  assert.equal(isLegacyRemote('https://github.com/Andersonfdc/aec-skills/'), true)
  assert.equal(isLegacyRemote('https://github.com/andersonfdc/AEC-Skills.git'), true)
})

test('a URL atual da biblioteca não é legado', () => {
  assert.equal(isLegacyRemote(DEFAULT_REMOTE_URL), false)
})

test('URL ausente ou de terceiro não é legado', () => {
  assert.equal(isLegacyRemote(undefined), false)
  assert.equal(isLegacyRemote(null), false)
  assert.equal(isLegacyRemote('https://github.com/outro/repo.git'), false)
})

/** @param {string} home @param {string} remoteUrl */
async function seedStore(home, remoteUrl) {
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'hello-aec'), { recursive: true })
  await writeFile(path.join(repo, 'skills', 'hello-aec', 'SKILL.md'), '---\nname: hello-aec\ndescription: X.\n---\n')
  await writeConfig(home, { remoteUrl, token: 'ghp_preservar' })
}

test('a migração apaga o store legado e reaponta para a biblioteca', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home, LEGACY)
  const lines = []

  const migrated = await migrateLegacyStore(home, {
    log: (line) => lines.push(line),
    confirm: async () => true,
  })

  assert.equal(migrated, true)
  await assert.rejects(access(storePaths(home).repo), 'o store velho tem que sumir')

  const config = await readConfig(home)
  assert.equal(config.remoteUrl, DEFAULT_REMOTE_URL)
  assert.equal(config.token, 'ghp_preservar', 'o token não pode ser perdido na migração')
})

test('a migração explica o que aconteceu, sem jargão', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home, LEGACY)
  const lines = []

  await migrateLegacyStore(home, { log: (l) => lines.push(l), confirm: async () => true })
  const out = lines.join('\n')

  assert.match(out, /biblioteca (mudou|foi movida)/i)
  assert.doesNotMatch(out, /ghp_preservar/, 'o token nunca aparece em log')
})

test('recusar a migração não apaga nada', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home, LEGACY)

  const migrated = await migrateLegacyStore(home, { log: () => {}, confirm: async () => false })

  assert.equal(migrated, false)
  await access(storePaths(home).repo)
  assert.equal((await readConfig(home)).remoteUrl, LEGACY, 'o config fica intacto')
})

test('store já na URL atual: a migração é no-op e não pergunta nada', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home, DEFAULT_REMOTE_URL)
  let asked = false

  const migrated = await migrateLegacyStore(home, {
    log: () => {},
    confirm: async () => { asked = true; return true },
  })

  assert.equal(migrated, false)
  assert.equal(asked, false)
  await access(storePaths(home).repo)
})

// Regressão: a migração existia mas ninguém a chamava — removê-la do cli.js não
// matava teste nenhum, porque só o módulo estava coberto, nunca a ligação.
test('o cli repara o store legado antes de rodar qualquer comando', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home, LEGACY)
  const lines = []

  await runCli(['list'], {
    log: (line) => lines.push(line),
    homeDir: home,
    isTTY: true,
    confirm: async () => true,
  })

  assert.match(lines.join('\n'), /biblioteca mudou de endereço/i)
  assert.equal((await readConfig(home)).remoteUrl, DEFAULT_REMOTE_URL)
  await assert.rejects(access(storePaths(home).repo))
})

test('num pipe, o cli explica o problema mas não apaga nada sem confirmação', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home, LEGACY)
  const lines = []

  await runCli(['list'], { log: (l) => lines.push(l), homeDir: home, isTTY: false })

  assert.match(lines.join('\n'), /biblioteca mudou de endereço/i)
  // Sem o "sim" do usuário, o store fica onde está e o config não é reescrito.
  await access(storePaths(home).repo)
  assert.equal((await readConfig(home)).remoteUrl, LEGACY)
})

test('URL customizada de terceiro é respeitada, nunca migrada à força', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home, 'https://github.com/outra-org/skills.git')

  assert.equal(await migrateLegacyStore(home, { log: () => {}, confirm: async () => true }), false)
  assert.equal((await readConfig(home)).remoteUrl, 'https://github.com/outra-org/skills.git')
})
