import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOCK_START, BLOCK_END,
  mergeTextBlock, removeTextBlock, mergeJsonHooks, removeJsonHooks,
} from '../src/merge-block.js'

test('mergeTextBlock anexa o bloco quando o arquivo não o tem', () => {
  const result = mergeTextBlock('# Meu contexto\n', 'CONTEUDO')
  assert.match(result, /^# Meu contexto\n/)
  assert.ok(result.includes(BLOCK_START))
  assert.ok(result.includes('CONTEUDO'))
  assert.ok(result.includes(BLOCK_END))
})

test('mergeTextBlock substitui o bloco existente e preserva o resto', () => {
  const existing = `# Topo\n\n${BLOCK_START}\nANTIGO\n${BLOCK_END}\n\n# Rodapé\n`
  const result = mergeTextBlock(existing, 'NOVO')
  assert.ok(result.includes('NOVO'))
  assert.ok(!result.includes('ANTIGO'))
  assert.ok(result.includes('# Topo'))
  assert.ok(result.includes('# Rodapé'))
})

test('mergeTextBlock é idempotente', () => {
  const once = mergeTextBlock('# Topo\n', 'X')
  assert.equal(mergeTextBlock(once, 'X'), once)
})

test('removeTextBlock apaga o bloco e preserva o resto', () => {
  const existing = `# Topo\n\n${BLOCK_START}\nX\n${BLOCK_END}\n\n# Rodapé\n`
  const result = removeTextBlock(existing)
  assert.ok(!result.includes(BLOCK_START))
  assert.ok(result.includes('# Topo'))
  assert.ok(result.includes('# Rodapé'))
})

test('mergeJsonHooks adiciona a entrada preservando as do usuário', () => {
  const settings = { hooks: { SessionStart: [{ command: 'do-usuario' }] } }
  const fragment = { hooks: { SessionStart: [{ command: 'aec' }] } }
  const result = mergeJsonHooks(settings, fragment)
  assert.deepEqual(result.hooks.SessionStart, [{ command: 'do-usuario' }, { command: 'aec' }])
})

test('mergeJsonHooks não duplica quando a entrada já existe', () => {
  const settings = { hooks: { SessionStart: [{ command: 'aec' }] } }
  const fragment = { hooks: { SessionStart: [{ command: 'aec' }] } }
  assert.deepEqual(mergeJsonHooks(settings, fragment).hooks.SessionStart, [{ command: 'aec' }])
})

test('mergeJsonHooks cria a chave quando o settings está vazio', () => {
  const result = mergeJsonHooks({}, { hooks: { SessionStart: [{ command: 'aec' }] } })
  assert.deepEqual(result.hooks.SessionStart, [{ command: 'aec' }])
})

test('removeJsonHooks remove só a nossa entrada', () => {
  const settings = { hooks: { SessionStart: [{ command: 'do-usuario' }, { command: 'aec' }] } }
  const fragment = { hooks: { SessionStart: [{ command: 'aec' }] } }
  const result = removeJsonHooks(settings, fragment)
  assert.deepEqual(result.hooks.SessionStart, [{ command: 'do-usuario' }])
})

test('mergeTextBlock rejeita marcador start órfão', () => {
  assert.throws(() => mergeTextBlock(`# Topo\n${BLOCK_START}\nX\n`, 'NOVO'), /malformado/)
})

test('mergeTextBlock rejeita marcador end órfão', () => {
  assert.throws(() => mergeTextBlock(`# Topo\nX\n${BLOCK_END}\n`, 'NOVO'), /malformado/)
})

test('removeTextBlock rejeita marcador start órfão', () => {
  assert.throws(() => removeTextBlock(`# Topo\n${BLOCK_START}\nX\n`), /malformado/)
})

test('removeTextBlock rejeita marcador end órfão', () => {
  assert.throws(() => removeTextBlock(`# Topo\nX\n${BLOCK_END}\n`), /malformado/)
})

test('mergeJsonHooks e removeJsonHooks não mutam settings nem fragment', () => {
  const settings = { hooks: { SessionStart: [{ command: 'do-usuario' }] } }
  const fragment = { hooks: { SessionStart: [{ command: 'aec' }] } }
  const settingsBefore = structuredClone(settings)
  const fragmentBefore = structuredClone(fragment)

  mergeJsonHooks(settings, fragment)
  removeJsonHooks(settings, fragment)

  assert.deepEqual(settings, settingsBefore)
  assert.deepEqual(fragment, fragmentBefore)
})

test('removeJsonHooks não injeta array vazio para evento ausente', () => {
  const settings = { hooks: { SessionStart: [{ command: 'do-usuario' }] } }
  const fragment = { hooks: { PreToolUse: [{ command: 'aec' }] } }
  const result = removeJsonHooks(settings, fragment)
  assert.ok(!('PreToolUse' in result.hooks))
})
