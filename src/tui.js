import { emitKeypressEvents } from 'node:readline'

/**
 * @typedef {{ name: string, kind: string, description: string }} MenuItem
 * @typedef {{ items: MenuItem[], cursor: number, selected: Set<number> }} MenuState
 * @typedef {{ state: MenuState, action: 'continue'|'confirm'|'cancel' }} KeyResult
 */

/**
 * @param {MenuItem[]} items
 * @returns {MenuState}
 */
export function newMenu(items) {
  return { items, cursor: 0, selected: new Set() }
}

/**
 * Reducer puro do menu. Separado do loop de I/O para ser testável sem TTY.
 * @param {MenuState} state
 * @param {{ name?: string, ctrl?: boolean }} key como o `keypress` do readline entrega
 * @returns {KeyResult}
 */
export function applyKey(state, key) {
  if (key.ctrl) {
    return key.name === 'c' ? { state, action: 'cancel' } : { state, action: 'continue' }
  }

  switch (key.name) {
    case 'up':
    case 'k':
      return { state: { ...state, cursor: Math.max(0, state.cursor - 1) }, action: 'continue' }
    case 'down':
    case 'j':
      return { state: { ...state, cursor: Math.min(state.items.length - 1, state.cursor + 1) }, action: 'continue' }
    case 'space':
      return { state: { ...state, selected: toggled(state.selected, state.cursor) }, action: 'continue' }
    case 'a':
      return { state: { ...state, selected: toggledAll(state) }, action: 'continue' }
    case 'return':
      return { state, action: 'confirm' }
    case 'q':
    case 'escape':
      return { state, action: 'cancel' }
    default:
      return { state, action: 'continue' }
  }
}

/**
 * Nenhuma linha pode passar da largura do terminal: se ela quebrar, o menu passa
 * a ocupar mais linhas do que o `paint` conta, e o redesenho sobe de menos e
 * deixa lixo na tela.
 * @param {MenuState} state
 * @param {string[]} harnesses
 * @param {number} [columns] largura do terminal
 * @returns {string}
 */
export function renderMenu(state, harnesses, columns = 80) {
  const nameWidth = Math.max(0, ...state.items.map((i) => i.name.length))
  const rows = state.items.map((item, i) => {
    const cursor = i === state.cursor ? '>' : ' '
    const box = state.selected.has(i) ? '[x]' : '[ ]'
    const label = `${item.name.padEnd(nameWidth)}  ${item.kind.padEnd(7)} ${item.description}`
    return clip(`${cursor} ${box} ${label}`.trimEnd(), columns)
  })

  return [
    '  Selecione o que instalar:',
    '',
    ...rows,
    '',
    `  Harnesses detectados: ${harnesses.join(', ') || 'nenhum'}`,
    '',
    '  <espaço> marca   <a> tudo   <enter> instala   <q> sai',
  ].join('\n')
}

/**
 * Loop de I/O do menu. Devolve os nomes escolhidos, ou null se o usuário saiu.
 * @param {MenuItem[]} items
 * @param {string[]} harnesses
 * @param {{ input?: NodeJS.ReadStream, output?: NodeJS.WriteStream }} [io]
 * @returns {Promise<string[]|null>}
 */
export function selectFromMenu(items, harnesses, io = {}) {
  const input = io.input ?? process.stdin
  const output = io.output ?? process.stdout

  return new Promise((resolve) => {
    let state = newMenu(items)
    let painted = 0

    const paint = () => {
      if (painted > 0) output.write(`\x1b[${painted}A\x1b[0J`)
      const frame = renderMenu(state, harnesses, output.columns || 80)
      output.write(`${frame}\n`)
      painted = frame.split('\n').length
    }

    const onKey = (_str, key) => {
      const result = applyKey(state, key ?? {})
      state = result.state
      if (result.action === 'continue') return paint()

      finish()
      resolve(result.action === 'cancel'
        ? null
        : [...state.selected].sort((a, b) => a - b).map((i) => items[i].name))
    }

    const finish = () => {
      input.off('keypress', onKey)
      if (input.isTTY) input.setRawMode(false)
      input.pause()
      output.write('\n')
    }

    emitKeypressEvents(input)
    if (input.isTTY) input.setRawMode(true)
    input.resume()
    input.on('keypress', onKey)
    paint()
  })
}

/** @param {string} line @param {number} columns @returns {string} */
function clip(line, columns) {
  return line.length <= columns ? line : `${line.slice(0, columns - 1)}…`
}

/** @param {Set<number>} selected @param {number} index @returns {Set<number>} */
function toggled(selected, index) {
  const next = new Set(selected)
  if (!next.delete(index)) next.add(index)
  return next
}

/** @param {MenuState} state @returns {Set<number>} */
function toggledAll(state) {
  const all = state.selected.size === state.items.length
  return all ? new Set() : new Set(state.items.map((_, i) => i))
}
