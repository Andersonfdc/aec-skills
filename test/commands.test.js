import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { runList } from '../src/commands/list.js'
import { runAdd } from '../src/commands/add.js'
import { runRemove } from '../src/commands/remove.js'
import { runUpdate } from '../src/commands/update.js'
import { runUninstall } from '../src/commands/uninstall.js'
import { storePaths } from '../src/paths.js'
import { readInstalled } from '../src/state.js'
import { FakeGitStore } from './helpers/fake-git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

async function seed(home) {
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'code-review'), { recursive: true })
  await writeFile(
    path.join(repo, 'skills', 'code-review', 'SKILL.md'),
    '---\nname: code-review\ndescription: Revisa código.\n---\n# R\n',
  )
  await mkdir(path.join(home, '.claude'), { recursive: true })
}

test('runList mostra as skills e marca as instaladas', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const output = []

  const code = await runList(home, {}, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  assert.match(output.join('\n'), /code-review.*Revisa código\./s)
})

test('runAdd instala a skill no harness detectado', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  const code = await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  await access(path.join(home, '.claude', 'skills', 'code-review', 'SKILL.md'))
  assert.equal((await readInstalled(home)).length, 1)
})

test('runAdd falha citando o artefato inexistente', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const output = []

  const code = await runAdd(home, { _: ['inexistente'] }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /não encontrado: inexistente/)
})

test('runAdd recusa artefato com frontmatter inválido', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const { repo } = storePaths(home)
  await mkdir(path.join(repo, 'skills', 'quebrada'), { recursive: true })
  await writeFile(path.join(repo, 'skills', 'quebrada', 'SKILL.md'), '---\nname: errado\n---\nx\n')
  const output = []

  const code = await runAdd(home, { _: ['quebrada'] }, { log: (l) => output.push(l), gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  assert.match(output.join('\n'), /frontmatter inválido/)
})

test('runAdd --all instala tudo', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  await runAdd(home, { _: [], all: true }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal((await readInstalled(home)).length, 1)
})

test('runRemove desinstala e limpa installed.json', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const code = await runRemove(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  assert.deepEqual(await readInstalled(home), [])
})

test('runUpdate pula skill editada localmente e avisa', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const git = new FakeGitStore({ modified: ['skills/code-review/SKILL.md'] })
  const output = []

  const code = await runUpdate(home, {}, { log: (l) => output.push(l), gitStore: git })

  assert.equal(code, 0)
  assert.ok(!git.calls.includes('pull'))
  assert.match(output.join('\n'), /editad[ao] localmente.*--force/s)
})

test('runUpdate --force aplica mesmo com edição local', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  const git = new FakeGitStore({ modified: ['skills/code-review/SKILL.md'] })

  await runUpdate(home, { force: true }, { log: () => {}, gitStore: git })

  assert.ok(git.calls.includes('pull'))
})

test('runUninstall remove os links e o store', async (t) => {
  const home = await tmpHome(t)
  await seed(home)
  await runAdd(home, { _: ['code-review'] }, { log: () => {}, gitStore: new FakeGitStore() })

  const code = await runUninstall(home, {}, { log: () => {}, confirm: async () => true, gitStore: new FakeGitStore() })

  assert.equal(code, 0)
  await assert.rejects(() => access(path.join(home, '.claude', 'skills', 'code-review')))
  await assert.rejects(() => access(storePaths(home).store))
})

test('runUninstall aborta quando o usuário não confirma', async (t) => {
  const home = await tmpHome(t)
  await seed(home)

  const code = await runUninstall(home, {}, { log: () => {}, confirm: async () => false, gitStore: new FakeGitStore() })

  assert.equal(code, 1)
  await access(storePaths(home).store)
})
