import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSkill, validateAgent } from '../src/validate.js'

test('validateSkill aceita frontmatter correto', () => {
  const attrs = { name: 'code-review', description: 'Revisa código antes do merge.' }
  assert.deepEqual(validateSkill(attrs, 'code-review'), [])
})

test('validateSkill exige name e description', () => {
  const errors = validateSkill({}, 'code-review')
  assert.equal(errors.length, 2)
  assert.match(errors.join(' '), /name.*obrigatório/)
  assert.match(errors.join(' '), /description.*obrigatório/)
})

test('validateSkill rejeita name diferente do nome da pasta', () => {
  const attrs = { name: 'outro-nome', description: 'x' }
  const errors = validateSkill(attrs, 'code-review')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /name "outro-nome" difere da pasta "code-review"/)
})

test('validateSkill rejeita caracteres fora de [a-z0-9-]', () => {
  const errors = validateSkill({ name: 'Code_Review', description: 'x' }, 'Code_Review')
  assert.match(errors.join(' '), /apenas \[a-z0-9-\].*recebido "Code_Review"/)
})

test('validateSkill rejeita name acima de 64 caracteres', () => {
  const name = 'a'.repeat(65)
  const errors = validateSkill({ name, description: 'x' }, name)
  assert.match(errors.join(' '), /máximo 64 caracteres.*recebido 65/)
})

test('validateSkill rejeita description acima de 1024 caracteres', () => {
  const errors = validateSkill({ name: 'x', description: 'a'.repeat(1025) }, 'x')
  assert.match(errors.join(' '), /máximo 1024 caracteres.*recebido 1025/)
})

test('validateAgent exige description', () => {
  const errors = validateAgent({ name: 'reviewer' }, 'reviewer.md')
  assert.match(errors.join(' '), /description.*obrigatório/)
})

test('validateAgent aceita agent sem tools', () => {
  assert.deepEqual(validateAgent({ name: 'reviewer', description: 'Revisa.' }, 'reviewer.md'), [])
})

// Regressão: o teto de 1024 da skill era aplicado ao agent também, e barrava o
// `security-auditor` da biblioteca real (3016 chars) — descrição com blocos
// <example> é padrão em agent, e o próprio Claude Code carrega a dele sem reclamar.
test('validateAgent não impõe teto de tamanho na description', () => {
  const attrs = { name: 'auditor', description: 'x'.repeat(3016) }
  assert.deepEqual(validateAgent(attrs, 'auditor.md'), [])
})
