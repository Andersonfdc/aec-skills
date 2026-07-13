import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { installArtifact, uninstallArtifact, syncGeminiContext } from '../src/install.js'
import { readInstalled } from '../src/state.js'
import { storePaths } from '../src/paths.js'
import { buildDerivatives } from '../src/build.js'
import { tmpHome } from './helpers/tmp-home.js'

/** Monta um store com uma skill e um agent reais em disco. */
async function seedStore(home) {
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa.\n---\n# R\n',
  )
  const skill = {
    kind: 'skill', name: 'code-review', sourcePath: path.join(repo, 'skills', 'code-review'),
    attrs: { name: 'code-review', description: 'Revisa.' }, body: '# R\n', errors: [],
  }
  const agent = {
    kind: 'agent', name: 'reviewer', sourcePath: path.join(repo, 'agents', 'reviewer.md'),
    attrs: { name: 'reviewer', description: 'Revisor.' }, body: '# Rev\n', errors: [],
  }
  await buildDerivatives(home, [skill, agent])
  return { skill, agent }
}

test('installArtifact liga a skill nos três harnesses que leem SKILL.md', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)

  const result = await installArtifact(home, skill, ['claude', 'copilot', 'codex'], 'abc1234')

  assert.equal(result.installed.length, 3)
  assert.equal(result.skipped.length, 0)
  for (const harness of ['.claude', '.copilot', '.codex']) {
    const file = path.join(home, harness, 'skills', 'code-review', 'SKILL.md')
    assert.match(await readFile(file, 'utf8'), /name: code-review/)
  }
})

test('installArtifact registra as entradas em installed.json', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)
  await installArtifact(home, skill, ['claude'], 'abc1234')

  const entries = await readInstalled(home)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].name, 'code-review')
  assert.equal(entries[0].harness, 'claude')
  assert.equal(entries[0].sha, 'abc1234')
})

test('installArtifact pula o harness que não suporta o tipo do artefato', async (t) => {
  const home = await tmpHome(t)
  const { agent } = await seedStore(home)

  const result = await installArtifact(home, agent, ['copilot', 'codex'], 'abc1234')

  assert.equal(result.installed.length, 1)
  assert.equal(result.installed[0].harness, 'copilot')
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].harness, 'codex')
  assert.match(result.skipped[0].reason, /não suporta agent/)
})

test('installArtifact usa a extensão .agent.md no Copilot', async (t) => {
  const home = await tmpHome(t)
  const { agent } = await seedStore(home)
  await installArtifact(home, agent, ['copilot'], 'abc1234')

  await access(path.join(home, '.copilot', 'agents', 'reviewer.agent.md'))
})

test('installArtifact pula destino ocupado pelo usuário, sem sobrescrever', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)
  const dest = path.join(home, '.claude', 'skills', 'code-review')
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'do usuário')

  const result = await installArtifact(home, skill, ['claude'], 'abc1234')

  assert.equal(result.installed.length, 0)
  assert.equal(result.skipped.length, 1)
  assert.match(result.skipped[0].reason, /já existe/)
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'do usuário')
})

test('uninstallArtifact remove os destinos e limpa installed.json', async (t) => {
  const home = await tmpHome(t)
  const { skill } = await seedStore(home)
  await installArtifact(home, skill, ['claude', 'copilot'], 'abc1234')

  const removed = await uninstallArtifact(home, 'code-review')

  assert.equal(removed, 2)
  assert.deepEqual(await readInstalled(home), [])
  await assert.rejects(() => access(path.join(home, '.claude', 'skills', 'code-review')))
})

test('syncGeminiContext escreve o bloco marcado sem apagar o conteúdo do usuário', async (t) => {
  const home = await tmpHome(t)
  await seedStore(home)
  await mkdir(path.join(home, '.gemini'), { recursive: true })
  await writeFile(path.join(home, '.gemini', 'GEMINI.md'), '# Meu contexto pessoal\n')

  await syncGeminiContext(home)

  const content = await readFile(path.join(home, '.gemini', 'GEMINI.md'), 'utf8')
  assert.match(content, /# Meu contexto pessoal/)
  assert.match(content, /aec-skills:start/)
  assert.match(content, /code-review/)
})
