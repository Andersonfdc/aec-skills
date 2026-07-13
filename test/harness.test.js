import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { HARNESSES, detectHarnesses, resolveHarnesses } from '../src/harness.js'
import { storePaths } from '../src/paths.js'

test('storePaths deriva todos os caminhos do home', () => {
  const p = storePaths('/home/x')
  assert.equal(p.store, path.join('/home/x', '.aec-skills'))
  assert.equal(p.repo, path.join('/home/x', '.aec-skills', 'repo'))
  assert.equal(p.build, path.join('/home/x', '.aec-skills', 'build'))
  assert.equal(p.configFile, path.join('/home/x', '.aec-skills', 'config.json'))
  assert.equal(p.installedFile, path.join('/home/x', '.aec-skills', 'installed.json'))
})

test('HARNESSES mapeia os quatro alvos com os paths documentados', () => {
  assert.deepEqual(Object.keys(HARNESSES).sort(), ['claude', 'codex', 'copilot', 'gemini'])
  assert.equal(HARNESSES.claude.skillsDir('/h'), path.join('/h', '.claude', 'skills'))
  assert.equal(HARNESSES.copilot.skillsDir('/h'), path.join('/h', '.copilot', 'skills'))
  assert.equal(HARNESSES.codex.skillsDir('/h'), path.join('/h', '.codex', 'skills'))
  assert.equal(HARNESSES.gemini.skillsDir, null)
  assert.equal(HARNESSES.copilot.agentExt, '.agent.md')
  assert.equal(HARNESSES.claude.agentExt, '.md')
  assert.equal(HARNESSES.codex.agentsDir, null)
  assert.equal(HARNESSES.gemini.contextFile('/h'), path.join('/h', '.gemini', 'GEMINI.md'))
})

test('detectHarnesses reconhece apenas os diretórios existentes', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aec-home-'))
  await mkdir(path.join(home, '.claude'))
  await mkdir(path.join(home, '.copilot'))
  assert.deepEqual(await detectHarnesses(home), ['claude', 'copilot'])
})

test('detectHarnesses devolve lista vazia num home limpo', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aec-home-'))
  assert.deepEqual(await detectHarnesses(home), [])
})

test('resolveHarnesses respeita a flag --harness', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'aec-home-'))
  await mkdir(path.join(home, '.claude'))
  assert.deepEqual(await resolveHarnesses('copilot,codex', home), ['copilot', 'codex'])
})

test('resolveHarnesses rejeita harness desconhecido citando o valor', async () => {
  await assert.rejects(
    () => resolveHarnesses('cursor', '/h'),
    /harness desconhecido: "cursor".*claude, codex, copilot, gemini/s,
  )
})
