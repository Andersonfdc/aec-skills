import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { computeChanges, formatChanges, maybeFetch, runStatus } from '../src/commands/status.js'
import { writeConfig, readConfig, writeInstalled } from '../src/state.js'
import { storePaths } from '../src/paths.js'
import { FakeGitStore } from './helpers/fake-git-store.js'
import { tmpHome } from './helpers/tmp-home.js'

async function seedSkills(home, names) {
  const { repo } = storePaths(home)
  for (const name of names) {
    await mkdir(path.join(repo, 'skills', name), { recursive: true })
    await writeFile(
      path.join(repo, 'skills', name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: d\n---\nCorpo\n`,
    )
  }
}

test('computeChanges marca como modificada a skill instalada que mudou no remoto', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  await writeInstalled(home, [{
    name: 'code-review', kind: 'skill', harness: 'claude',
    dest: '/x', mode: 'link', sha: 'aaaa111',
  }])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'bbbb222', changed: ['skills/code-review/SKILL.md'] })

  const changes = await computeChanges(home, git)

  assert.equal(changes.length, 1)
  assert.equal(changes[0].kind, 'modified')
  assert.equal(changes[0].name, 'code-review')
})

test('computeChanges marca como nova a skill que existe no remoto e não está instalada', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'bbbb222', changed: ['skills/security-audit/SKILL.md'] })

  const changes = await computeChanges(home, git)

  assert.ok(changes.some((c) => c.kind === 'new' && c.name === 'security-audit'))
})

test('computeChanges avisa sobre skill editada localmente', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['karpathy'])
  await writeInstalled(home, [{
    name: 'karpathy', kind: 'skill', harness: 'claude', dest: '/x', mode: 'link', sha: 'aaaa111',
  }])
  const git = new FakeGitStore({ modified: ['skills/karpathy/SKILL.md'] })

  const changes = await computeChanges(home, git)

  assert.equal(changes[0].kind, 'locally-edited')
  assert.equal(changes[0].name, 'karpathy')
})

test('computeChanges devolve vazio quando local e remoto estão iguais', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'aaaa111' })

  assert.deepEqual(await computeChanges(home, git), [])
})

test('formatChanges usa os marcadores ~ + e !', () => {
  const output = formatChanges([
    { kind: 'modified', name: 'code-review', detail: '2 commits atrás' },
    { kind: 'new', name: 'security-audit', detail: 'nova na biblioteca' },
    { kind: 'locally-edited', name: 'karpathy', detail: 'você editou localmente' },
  ])
  assert.match(output, /~ code-review/)
  assert.match(output, /\+ security-audit/)
  assert.match(output, /! karpathy/)
  assert.match(output, /aec-skills update/)
})

test('formatChanges informa que está tudo em dia quando não há mudança', () => {
  assert.match(formatChanges([]), /tudo em dia/)
})

test('maybeFetch busca quando nunca buscou antes', async (t) => {
  const home = await tmpHome(t)
  const git = new FakeGitStore()

  assert.equal(await maybeFetch(home, git, 1_000_000), true)
  assert.ok(git.calls.includes('fetch'))
  assert.equal((await readConfig(home)).lastFetch, 1_000_000)
})

test('maybeFetch não busca de novo dentro de 6 horas', async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { lastFetch: 1_000_000 })
  const git = new FakeGitStore()

  const oneHourLater = 1_000_000 + 60 * 60 * 1000
  assert.equal(await maybeFetch(home, git, oneHourLater), false)
  assert.deepEqual(git.calls, [])
})

test('maybeFetch busca de novo depois de 6 horas', async (t) => {
  const home = await tmpHome(t)
  await writeConfig(home, { lastFetch: 1_000_000 })
  const git = new FakeGitStore()

  const sevenHoursLater = 1_000_000 + 7 * 60 * 60 * 1000
  assert.equal(await maybeFetch(home, git, sevenHoursLater), true)
})

test('maybeFetch devolve false e não quebra quando está offline', async (t) => {
  const home = await tmpHome(t)
  const git = new FakeGitStore()
  git.fetch = async () => { throw new Error('getaddrinfo ENOTFOUND github.com') }

  assert.equal(await maybeFetch(home, git, 1_000_000), false)
})

test('runStatus imprime as mudanças e retorna 0', async (t) => {
  const home = await tmpHome(t)
  await seedSkills(home, ['code-review'])
  const git = new FakeGitStore({ head: 'aaaa111', remoteHead: 'bbbb222', changed: ['skills/code-review/SKILL.md'] })
  const output = []

  const code = await runStatus(home, git, { log: (l) => output.push(l) })

  assert.equal(code, 0)
  assert.match(output.join('\n'), /code-review/)
})
