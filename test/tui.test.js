import test from 'node:test'
import assert from 'node:assert/strict'
import { newMenu, applyKey, renderMenu, chosenNames } from '../src/tui.js'

/** @param {object} [opts] @returns {import('../src/tui.js').MenuState} */
function menu(opts) {
  return newMenu([
    { name: 'alfa', kind: 'skill', description: 'primeira' },
    { name: 'beta', kind: 'agent', description: 'segunda' },
    { name: 'gama', kind: 'hook', description: '' },
  ], opts)
}

test('newMenu começa no topo, sem nada marcado', () => {
  const state = menu()
  assert.equal(state.cursor, 0)
  assert.deepEqual([...state.selected], [])
})

test('down move o cursor e para no último item', () => {
  let state = menu()
  for (let i = 0; i < 5; i++) state = applyKey(state, { name: 'down' }).state
  assert.equal(state.cursor, 2)
})

test('up para no primeiro item', () => {
  let state = menu()
  state = applyKey(state, { name: 'up' }).state
  assert.equal(state.cursor, 0)
})

test('j e k andam como as setas', () => {
  let state = menu()
  state = applyKey(state, { name: 'j' }).state
  assert.equal(state.cursor, 1)
  state = applyKey(state, { name: 'k' }).state
  assert.equal(state.cursor, 0)
})

test('space marca e desmarca o item sob o cursor', () => {
  let state = menu()
  state = applyKey(state, { name: 'down' }).state
  state = applyKey(state, { name: 'space' }).state
  assert.deepEqual([...state.selected], [1])

  state = applyKey(state, { name: 'space' }).state
  assert.deepEqual([...state.selected], [])
})

test('a marca tudo; a de novo desmarca tudo', () => {
  let state = menu()
  state = applyKey(state, { name: 'a' }).state
  assert.deepEqual([...state.selected], [0, 1, 2])

  state = applyKey(state, { name: 'a' }).state
  assert.deepEqual([...state.selected], [])
})

test('a com seleção parcial completa em vez de limpar', () => {
  let state = menu()
  state = applyKey(state, { name: 'space' }).state
  state = applyKey(state, { name: 'a' }).state
  assert.deepEqual([...state.selected], [0, 1, 2])
})

test('enter confirma', () => {
  const state = menu()
  assert.equal(applyKey(state, { name: 'return' }).action, 'confirm')
})

test('q, escape e ctrl-c cancelam', () => {
  const state = menu()
  assert.equal(applyKey(state, { name: 'q' }).action, 'cancel')
  assert.equal(applyKey(state, { name: 'escape' }).action, 'cancel')
  assert.equal(applyKey(state, { name: 'c', ctrl: true }).action, 'cancel')
})

test('ctrl-a não é o atalho de marcar tudo', () => {
  const state = menu()
  const next = applyKey(state, { name: 'a', ctrl: true }).state
  assert.deepEqual([...next.selected], [])
})

test('tecla desconhecida não muda nada e não confirma', () => {
  const state = menu()
  const { state: next, action } = applyKey(state, { name: 'x' })
  assert.equal(action, 'continue')
  assert.equal(next, state)
})

test('chosenNames devolve os marcados, em ordem de tela', () => {
  let state = menu()
  state = applyKey(state, { name: 'down' }).state
  state = applyKey(state, { name: 'space' }).state
  state = applyKey(state, { name: 'up' }).state
  state = applyKey(state, { name: 'space' }).state

  assert.deepEqual(chosenNames(state), ['alfa', 'beta'])
})

test('renderMenu marca o cursor e os selecionados', () => {
  let state = menu()
  state = applyKey(state, { name: 'space' }).state
  const lines = renderMenu(state, { note: 'Harnesses detectados: claude, copilot' }).split('\n')

  assert.match(lines.find((l) => l.includes('alfa')), /^>\s+\[x\]/)
  assert.match(lines.find((l) => l.includes('beta')), /^\s+\[ \]/)
})

test('renderMenu mostra kind, descrição, título e nota', () => {
  const out = renderMenu(menu(), { title: 'Selecione o que instalar:', note: 'Harnesses detectados: claude, copilot' })
  assert.match(out, /Selecione o que instalar:/)
  assert.match(out, /skill/)
  assert.match(out, /primeira/)
  assert.match(out, /claude, copilot/)
})

test('renderMenu não quebra em biblioteca vazia', () => {
  assert.doesNotThrow(() => renderMenu(newMenu([])))
})

// Regressão: uma linha maior que o terminal ocupa duas, o `paint` conta uma, e o
// redesenho passa a subir de menos e deixar lixo na tela.
test('nenhuma linha passa da largura do terminal', () => {
  const state = newMenu([{ name: 'hello-aec', kind: 'skill', description: 'x'.repeat(200) }])
  const lines = renderMenu(state, { columns: 80 }).split('\n')

  for (const line of lines) assert.ok(line.length <= 80, `linha com ${line.length} col: ${line}`)
  assert.match(lines.find((l) => l.includes('hello-aec')), /…$/)
})

test('modo single: a seleção é o cursor, e só um nome sai', () => {
  let state = menu({ single: true })
  state = applyKey(state, { name: 'down' }).state

  assert.deepEqual(chosenNames(state), ['beta'])
})

test('modo single: space e a não marcam nada', () => {
  let state = menu({ single: true })
  state = applyKey(state, { name: 'space' }).state
  state = applyKey(state, { name: 'a' }).state

  assert.deepEqual([...state.selected], [])
  assert.deepEqual(chosenNames(state), ['alfa'])
})

test('modo single: render usa radio e esconde os atalhos de marcação', () => {
  const out = renderMenu(menu({ single: true }), { title: 'Como autenticar?' })

  assert.match(out, /^>\s+\(•\) alfa/m)
  assert.match(out, /^\s+\( \) beta/m)
  assert.doesNotMatch(out, /<espaço>/)
  assert.match(out, /<enter> escolhe/)
})
