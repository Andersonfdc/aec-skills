import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCopilotAgent } from '../src/adapters/copilot-agent.js'
import { toGeminiIndex } from '../src/adapters/gemini-index.js'
import { toGeminiCommand } from '../src/adapters/gemini-command.js'
import { parseFrontmatter } from '../src/frontmatter.js'

/** @returns {import('../src/library.js').Artifact} */
function agentFixture(attrs) {
  return { kind: 'agent', name: 'reviewer', sourcePath: '/x/reviewer.md', attrs, body: '# Revisor\n', errors: [] }
}

test('toCopilotAgent omite tools quando não há override', () => {
  const agent = agentFixture({ name: 'reviewer', description: 'Revisa.', tools: 'Read, Grep, Bash' })
  const { attrs, body } = parseFrontmatter(toCopilotAgent(agent))

  assert.equal(attrs.tools, undefined)
  assert.equal(attrs.description, 'Revisa.')
  assert.equal(attrs.name, 'reviewer')
  assert.equal(body, '# Revisor\n')
})

test('toCopilotAgent usa targets.copilot.tools quando declarado', () => {
  const agent = agentFixture({
    name: 'reviewer',
    description: 'Revisa.',
    tools: 'Read, Grep',
    targets: { copilot: { tools: ['search/codebase', 'search/usages'] } },
  })
  const { attrs } = parseFrontmatter(toCopilotAgent(agent))
  assert.deepEqual(attrs.tools, ['search/codebase', 'search/usages'])
})

test('toCopilotAgent nunca emite o campo targets no arquivo final', () => {
  const agent = agentFixture({
    name: 'reviewer',
    description: 'Revisa.',
    targets: { copilot: { tools: ['search/codebase'] } },
  })
  const { attrs } = parseFrontmatter(toCopilotAgent(agent))
  assert.equal(attrs.targets, undefined)
})

test('toCopilotAgent preserva model quando presente', () => {
  const agent = agentFixture({ name: 'r', description: 'd', model: 'opus' })
  const { attrs } = parseFrontmatter(toCopilotAgent(agent))
  assert.equal(attrs.model, 'opus')
})

test('toGeminiIndex lista nome, descrição e caminho de cada skill', () => {
  const skills = [
    { kind: 'skill', name: 'code-review', sourcePath: '/store/repo/skills/code-review',
      attrs: { name: 'code-review', description: 'Revisa código.' }, body: '', errors: [] },
    { kind: 'skill', name: 'diagnose', sourcePath: '/store/repo/skills/diagnose',
      attrs: { name: 'diagnose', description: 'Erro sem stack trace.' }, body: '', errors: [] },
  ]
  const index = toGeminiIndex(skills, '/store/repo')

  assert.match(index, /## Skills disponíveis/)
  assert.match(index, /\*\*code-review\*\* — Revisa código\./)
  assert.match(index, /skills\/code-review\/SKILL\.md/)
  assert.match(index, /\*\*diagnose\*\* — Erro sem stack trace\./)
})

test('toGeminiIndex não inclui o corpo das skills, só o índice', () => {
  const skills = [{
    kind: 'skill', name: 'x', sourcePath: '/store/repo/skills/x',
    attrs: { name: 'x', description: 'd' }, body: 'CORPO ENORME DA SKILL', errors: [],
  }]
  assert.ok(!toGeminiIndex(skills, '/store/repo').includes('CORPO ENORME DA SKILL'))
})

test('toGeminiIndex devolve aviso quando não há skills', () => {
  assert.match(toGeminiIndex([], '/store/repo'), /Nenhuma skill instalada/)
})

test('toGeminiIndex normaliza repoDir com separadores Windows para barras', () => {
  const skills = [{
    kind: 'skill', name: 'x', sourcePath: 'C:\\Users\\x\\.aec-skills\\repo\\skills\\x',
    attrs: { name: 'x', description: 'd' }, body: '', errors: [],
  }]
  const index = toGeminiIndex(skills, 'C:\\Users\\x\\.aec-skills\\repo')
  assert.ok(!index.includes('\\'))
  assert.match(index, /C:\/Users\/x\/\.aec-skills\/repo\/skills\/x\/SKILL\.md/)
})

test('toGeminiCommand gera TOML com prompt e description', () => {
  const command = {
    kind: 'command', name: 'deepdive', sourcePath: '/x/deepdive.md',
    attrs: { description: 'Análise profunda.' }, body: 'Analise a fundo.\n', errors: [],
  }
  const toml = toGeminiCommand(command)
  assert.match(toml, /^description = "Análise profunda\."$/m)
  assert.match(toml, /prompt = '''/)
  assert.match(toml, /Analise a fundo\./)
})

test('toGeminiCommand escapa aspas na description', () => {
  const command = {
    kind: 'command', name: 'x', sourcePath: '/x.md',
    attrs: { description: 'Diz "olá".' }, body: 'corpo\n', errors: [],
  }
  assert.match(toGeminiCommand(command), /description = "Diz \\"olá\\"\."/)
})

test('toGeminiCommand preserva path Windows e regex sem escapar barras', () => {
  const command = {
    kind: 'command', name: 'x', sourcePath: '/x.md',
    attrs: {}, body: 'Leia C:\\Users\\x\\arquivo.md e valide \\d+\\n', errors: [],
  }
  const toml = toGeminiCommand(command)
  assert.match(toml, /prompt = '''/)
  assert.ok(toml.includes('Leia C:\\Users\\x\\arquivo.md e valide \\d+\\n'))
})

test('toGeminiCommand não termina a string cedo com """ dentro do corpo', () => {
  const command = {
    kind: 'command', name: 'x', sourcePath: '/x.md',
    attrs: {}, body: 'Exemplo:\n```python\ndef f():\n    """docstring"""\n```\n', errors: [],
  }
  const toml = toGeminiCommand(command)
  assert.match(toml, /prompt = '''/)
  assert.ok(toml.includes('"""docstring"""'))
})

test('toGeminiCommand cai para string básica escapada quando o corpo contém \'\'\'', () => {
  const command = {
    kind: 'command', name: 'x', sourcePath: '/x.md',
    attrs: {}, body: "trecho com '''três aspas simples'''\n", errors: [],
  }
  const toml = toGeminiCommand(command)
  assert.match(toml, /prompt = """/)
  assert.ok(toml.includes("trecho com '''três aspas simples'''"))
  assert.ok(!toml.includes('\\\''))
})
