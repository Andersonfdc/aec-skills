import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter, serializeFrontmatter } from '../src/frontmatter.js'

test('parseFrontmatter separa atributos do corpo', () => {
  const source = '---\nname: code-review\ndescription: Revisa código\n---\n# Título\n\nCorpo.\n'
  const { attrs, body } = parseFrontmatter(source)
  assert.deepEqual(attrs, { name: 'code-review', description: 'Revisa código' })
  assert.equal(body, '# Título\n\nCorpo.\n')
})

test('parseFrontmatter devolve attrs vazio quando não há frontmatter', () => {
  const { attrs, body } = parseFrontmatter('# Só corpo\n')
  assert.deepEqual(attrs, {})
  assert.equal(body, '# Só corpo\n')
})

test('parseFrontmatter preserva listas e objetos aninhados', () => {
  const source = "---\nname: x\ntools:\n  - Read\n  - Grep\ntargets:\n  copilot:\n    tools: ['search/codebase']\n---\nCorpo\n"
  const { attrs } = parseFrontmatter(source)
  assert.deepEqual(attrs.tools, ['Read', 'Grep'])
  assert.deepEqual(attrs.targets, { copilot: { tools: ['search/codebase'] } })
})

test('serializeFrontmatter é o inverso de parseFrontmatter', () => {
  const source = '---\nname: x\ndescription: y\n---\nCorpo\n'
  const { attrs, body } = parseFrontmatter(source)
  const roundTrip = parseFrontmatter(serializeFrontmatter(attrs, body))
  assert.deepEqual(roundTrip.attrs, attrs)
  assert.equal(roundTrip.body, body)
})

test('parseFrontmatter lança erro citando o YAML inválido', () => {
  assert.throws(
    () => parseFrontmatter('---\nname: [não fechado\n---\nCorpo\n'),
    /frontmatter YAML inválido/,
  )
})
