import { emitKeypressEvents } from 'node:readline'

/**
 * @typedef {{ name: string, kind?: string, description?: string }} MenuItem
 * @typedef {{ items: MenuItem[], cursor: number, selected: Set<number>, single: boolean }} MenuState
 * @typedef {{ state: MenuState, action: 'continue'|'confirm'|'cancel' }} KeyResult
 * @typedef {{ title?: string, note?: string, single?: boolean, columns?: number }} MenuOptions
 */

/**
 * @param {MenuItem[]} items
 * @param {MenuOptions} [opts] `single` faz do menu um radio: a seleção é sempre o cursor
 * @returns {MenuState}
 */
export function newMenu(items, opts = {}) {
  return { items, cursor: 0, selected: new Set(), single: Boolean(opts.single) }
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
      // Em modo radio a seleção acompanha o cursor: marcar não é uma ação à parte.
      if (state.single) return { state, action: 'continue' }
      return { state: { ...state, selected: toggled(state.selected, state.cursor) }, action: 'continue' }
    case 'a':
      if (state.single) return { state, action: 'continue' }
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
 * Os nomes que uma confirmação neste estado devolveria.
 * @param {MenuState} state
 * @returns {string[]}
 */
export function chosenNames(state) {
  if (state.items.length === 0) return []
  if (state.single) return [state.items[state.cursor].name]
  return [...state.selected].sort((a, b) => a - b).map((i) => state.items[i].name)
}

/**
 * Nenhuma linha pode passar da largura do terminal: se ela quebrar, o menu passa
 * a ocupar mais linhas do que o `paint` conta, e o redesenho sobe de menos e
 * deixa lixo na tela.
 * @param {MenuState} state
 * @param {MenuOptions} [opts]
 * @returns {string}
 */
export function renderMenu(state, opts = {}) {
  const columns = opts.columns ?? 80
  const nameWidth = Math.max(0, ...state.items.map((i) => i.name.length))

  const rows = state.items.map((item, i) => {
    const cursor = i === state.cursor ? '>' : ' '
    const box = state.single
      ? (i === state.cursor ? '(•)' : '( )')
      : (state.selected.has(i) ? '[x]' : '[ ]')
    const kind = item.kind ? `${item.kind.padEnd(7)} ` : ''
    const label = `${item.name.padEnd(nameWidth)}  ${kind}${item.description ?? ''}`
    return clip(`${cursor} ${box} ${label}`.trimEnd(), columns)
  })

  const keys = state.single
    ? '  <enter> escolhe   <q> sai'
    : '  <espaço> marca   <a> tudo   <enter> instala   <q> sai'

  return [
    `  ${opts.title ?? 'Selecione:'}`,
    '',
    ...rows,
    '',
    ...(opts.note ? [`  ${opts.note}`, ''] : []),
    keys,
  ].join('\n')
}

/**
 * Loop de I/O do menu. Devolve os nomes escolhidos, ou null se o usuário saiu.
 * @param {MenuItem[]} items
 * @param {MenuOptions & { input?: NodeJS.ReadStream, output?: NodeJS.WriteStream }} [opts]
 * @returns {Promise<string[]|null>}
 */
export function selectFromMenu(items, opts = {}) {
  const input = opts.input ?? process.stdin
  const output = opts.output ?? process.stdout

  return new Promise((resolve) => {
    let state = newMenu(items, opts)
    let painted = 0

    const paint = () => {
      if (painted > 0) output.write(`\x1b[${painted}A\x1b[0J`)
      const frame = renderMenu(state, { ...opts, columns: output.columns || 80 })
      output.write(`${frame}\n`)
      painted = frame.split('\n').length
    }

    const onKey = (_str, key) => {
      const result = applyKey(state, key ?? {})
      state = result.state
      if (result.action === 'continue') return paint()

      finish()
      resolve(result.action === 'cancel' ? null : chosenNames(state))
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
