import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readLibrary, findArtifact } from '../src/library.js'
import { tmpHome } from './helpers/tmp-home.js'

/** @param {string} repo */
async function seedRepo(repo) {
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa código.\n---\n# Revisão\n',
  )
  await mkdir(path.join(repo, 'agents'), { recursive: true })
  await writeFile(
    path.join(repo, 'agents', 'reviewer.md'),
    '---\nname: reviewer\ndescription: Revisor.\ntools: Read, Grep\n---\n# Revisor\n',
  )
  await mkdir(path.join(repo, 'commands'), { recursive: true })
  await writeFile(path.join(repo, 'commands', 'deepdive.md'), '---\ndescription: Análise.\n---\nAnalise fundo.\n')
}

test('readLibrary encontra skills, agents e commands', async (t) => {
  const repo = await tmpHome(t)
  await seedRepo(repo)

  const artifacts = await readLibrary(repo)
  assert.deepEqual(artifacts.map((a) => `${a.kind}:${a.name}`), [
    'agent:reviewer',
    'command:deepdive',
    'skill:code-review',
  ])
})

test('readLibrary preenche attrs, body e sourcePath', async (t) => {
  const repo = await tmpHome(t)
  await seedRepo(repo)

  const skill = findArtifact(await readLibrary(repo), 'code-review')
  assert.equal(skill.attrs.description, 'Revisa código.')
  assert.equal(skill.body, '# Revisão\n')
  assert.equal(skill.sourcePath, path.join(repo, 'skills', 'code-review'))
  assert.deepEqual(skill.errors, [])
})

test('readLibrary reporta erro de validação sem lançar', async (t) => {
  const repo = await tmpHome(t)
  await mkdir(path.join(repo, 'skills', 'quebrada'), { recursive: true })
  await writeFile(path.join(repo, 'skills', 'quebrada', 'SKILL.md'), '---\nname: outro\n---\nCorpo\n')

  const artifacts = await readLibrary(repo)
  assert.equal(artifacts.length, 1)
  assert.ok(artifacts[0].errors.length > 0)
  assert.match(artifacts[0].errors.join(' '), /difere da pasta/)
})

test('readLibrary devolve lista vazia num repo sem artefatos', async (t) => {
  const repo = await tmpHome(t)
  assert.deepEqual(await readLibrary(repo), [])
})

test('readLibrary encontra hooks com sourcePath de diretório', async (t) => {
  const repo = await tmpHome(t)
  await mkdir(path.join(repo, 'hooks', 'check-updates'), { recursive: true })
  await writeFile(path.join(repo, 'hooks', 'check-updates', 'hook.json'), '{}')

  const hook = findArtifact(await readLibrary(repo), 'check-updates')
  assert.equal(hook.kind, 'hook')
  assert.equal(hook.sourcePath, path.join(repo, 'hooks', 'check-updates'))
})

test('readLibrary sobrevive a YAML malformado sem derrubar o inventário', async (t) => {
  const repo = await tmpHome(t)
  await seedRepo(repo)
  await mkdir(path.join(repo, 'skills', 'quebrada'), { recursive: true })
  await writeFile(path.join(repo, 'skills', 'quebrada', 'SKILL.md'), '---\nname: [unterminated\n---\nbody\n')

  const artifacts = await readLibrary(repo)
  assert.ok(findArtifact(artifacts, 'code-review'), 'skill válida deve sobreviver')

  const broken = findArtifact(artifacts, 'quebrada')
  assert.ok(broken.errors.length > 0)
  assert.match(broken.errors.join(' '), /quebrada/)
})

test('readLibrary reporta erro de validação de agent sem lançar', async (t) => {
  const repo = await tmpHome(t)
  await mkdir(path.join(repo, 'agents'), { recursive: true })
  await writeFile(path.join(repo, 'agents', 'sem-descricao.md'), '---\nname: sem-descricao\n---\nCorpo\n')

  const agent = findArtifact(await readLibrary(repo), 'sem-descricao')
  assert.ok(agent.errors.length > 0)
})

test('readLibrary ignora README.md em agents/ e commands/', async (t) => {
  const repo = await tmpHome(t)
  await seedRepo(repo)
  await writeFile(path.join(repo, 'agents', 'README.md'), '# Agents\nDocumenta esta pasta.\n')
  await writeFile(path.join(repo, 'commands', 'README.md'), '# Commands\nDocumenta esta pasta.\n')

  const artifacts = await readLibrary(repo)
  assert.equal(findArtifact(artifacts, 'README'), undefined)
  assert.ok(findArtifact(artifacts, 'reviewer'), 'agent real deve continuar no inventário')
  assert.ok(findArtifact(artifacts, 'deepdive'), 'command real deve continuar no inventário')
})

test('readLibrary ignora README.md com qualquer capitalização', async (t) => {
  const repo = await tmpHome(t)
  await mkdir(path.join(repo, 'agents'), { recursive: true })
  await writeFile(path.join(repo, 'agents', 'readme.md'), '# Agents\n')

  const artifacts = await readLibrary(repo)
  assert.equal(findArtifact(artifacts, 'readme'), undefined)
  assert.equal(artifacts.length, 0)
})

test('readLibrary mantém agent com frontmatter inválido mesmo ao lado de um README', async (t) => {
  const repo = await tmpHome(t)
  await mkdir(path.join(repo, 'agents'), { recursive: true })
  await writeFile(path.join(repo, 'agents', 'README.md'), '# Agents\n')
  await writeFile(path.join(repo, 'agents', 'sem-descricao.md'), '---\nname: sem-descricao\n---\nCorpo\n')

  const artifacts = await readLibrary(repo)
  assert.equal(findArtifact(artifacts, 'README'), undefined)
  const agent = findArtifact(artifacts, 'sem-descricao')
  assert.ok(agent, 'agent com erro ainda deve aparecer no inventário')
  assert.ok(agent.errors.length > 0)
})
