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
