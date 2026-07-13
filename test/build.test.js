import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { buildDerivatives } from '../src/build.js'
import { storePaths } from '../src/paths.js'
import { tmpHome } from './helpers/tmp-home.js'

/** @returns {import('../src/library.js').Artifact[]} */
function fixtures(repoDir) {
  return [
    { kind: 'skill', name: 'code-review', sourcePath: path.join(repoDir, 'skills', 'code-review'),
      attrs: { name: 'code-review', description: 'Revisa.' }, body: '# R\n', errors: [] },
    { kind: 'agent', name: 'reviewer', sourcePath: path.join(repoDir, 'agents', 'reviewer.md'),
      attrs: { name: 'reviewer', description: 'Revisor.', tools: 'Read, Grep' }, body: '# Rev\n', errors: [] },
    { kind: 'command', name: 'deepdive', sourcePath: path.join(repoDir, 'commands', 'deepdive.md'),
      attrs: { description: 'Análise.' }, body: 'Analise.\n', errors: [] },
  ]
}

test('buildDerivatives gera o agent do Copilot sem o campo tools', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  const content = await readFile(path.join(build, 'copilot', 'agents', 'reviewer.agent.md'), 'utf8')
  assert.ok(content.includes('description: Revisor.'))
  assert.ok(!content.includes('tools:'))
})

test('buildDerivatives gera o command TOML do Gemini', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  const toml = await readFile(path.join(build, 'gemini', 'commands', 'deepdive.toml'), 'utf8')
  assert.match(toml, /prompt = '''/)
  assert.match(toml, /Analise\./)
})

test('buildDerivatives gera o índice do Gemini com as skills', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  const index = await readFile(path.join(build, 'gemini', 'index.md'), 'utf8')
  assert.match(index, /\*\*code-review\*\* — Revisa\./)
})

test('buildDerivatives não gera derivado para skill', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await buildDerivatives(home, fixtures(repo))

  await assert.rejects(() => access(path.join(build, 'claude', 'skills')))
})

test('buildDerivatives apaga derivados órfãos de um build anterior', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  await mkdir(path.join(build, 'copilot', 'agents'), { recursive: true })
  await writeFile(path.join(build, 'copilot', 'agents', 'removido.agent.md'), 'lixo')

  await buildDerivatives(home, fixtures(repo))
  await assert.rejects(() => access(path.join(build, 'copilot', 'agents', 'removido.agent.md')))
})

test('buildDerivatives é idempotente', async (t) => {
  const home = await tmpHome(t)
  const { repo, build } = storePaths(home)
  const artifacts = fixtures(repo)

  await buildDerivatives(home, artifacts)
  const first = await readFile(path.join(build, 'gemini', 'index.md'), 'utf8')
  await buildDerivatives(home, artifacts)
  assert.equal(await readFile(path.join(build, 'gemini', 'index.md'), 'utf8'), first)
})
