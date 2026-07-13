import { isDeepStrictEqual } from 'node:util'

export const BLOCK_START = '<!-- aec-skills:start -->'
export const BLOCK_END = '<!-- aec-skills:end -->'

const BLOCK_PATTERN = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}\\n?`)

/**
 * Insere ou substitui o bloco marcado, preservando todo o resto do arquivo.
 * @param {string} existing conteúdo atual ('' se o arquivo não existe)
 * @param {string} block conteúdo a colocar entre os marcadores
 * @returns {string}
 */
export function mergeTextBlock(existing, block) {
  assertWellFormedMarkers(existing)
  const marked = `${BLOCK_START}\n${block}\n${BLOCK_END}\n`
  if (BLOCK_PATTERN.test(existing)) return existing.replace(BLOCK_PATTERN, marked)

  const base = existing.length > 0 && !existing.endsWith('\n') ? `${existing}\n` : existing
  return `${base}\n${marked}`
}

/**
 * Remove o bloco marcado, preservando o resto.
 * @param {string} existing
 * @returns {string}
 */
export function removeTextBlock(existing) {
  assertWellFormedMarkers(existing)
  return existing.replace(BLOCK_PATTERN, '')
}

/**
 * Rejeita conteúdo com marcador órfão (apenas start ou apenas end), já que
 * um bloco malformado nunca casa com BLOCK_PATTERN e seria duplicado a cada
 * execução em vez de ser reparado.
 * @param {string} text
 * @returns {void}
 */
function assertWellFormedMarkers(text) {
  const hasStart = text.includes(BLOCK_START)
  const hasEnd = text.includes(BLOCK_END)
  if (hasStart && !hasEnd) {
    throw new Error(`bloco aec-skills malformado: encontrado "${BLOCK_START}" sem o "${BLOCK_END}" correspondente — remova o marcador órfão manualmente antes de continuar`)
  }
  if (hasEnd && !hasStart) {
    throw new Error(`bloco aec-skills malformado: encontrado "${BLOCK_END}" sem o "${BLOCK_START}" correspondente — remova o marcador órfão manualmente antes de continuar`)
  }
}

/**
 * Adiciona as entradas de hook do fragmento ao settings, sem duplicar e sem
 * remover as entradas do usuário.
 * @param {Record<string, unknown>} settings
 * @param {{ hooks: Record<string, object[]> }} fragment
 * @returns {Record<string, unknown>} novo objeto; o original não é mutado
 */
export function mergeJsonHooks(settings, fragment) {
  const merged = structuredClone(settings)
  merged.hooks ??= {}

  for (const [event, entries] of Object.entries(fragment.hooks)) {
    const current = merged.hooks[event] ?? []
    const missing = entries.filter((e) => !current.some((c) => isDeepStrictEqual(c, e)))
    merged.hooks[event] = [...current, ...missing]
  }
  return merged
}

/**
 * Remove do settings exatamente as entradas do fragmento.
 *
 * O casamento é por igualdade profunda (deep equality), não por proveniência:
 * não há campo marcador na entrada que identifique "isso é nosso" (injetar um
 * exigiria confirmar que o Claude Code tolera campos desconhecidos num hook,
 * o que não está verificado). Assim, uma entrada que o usuário tenha escrito
 * de forma byte-idêntica à nossa é indistinguível e também será removida. O
 * chamador deve mostrar ao usuário o que será removido antes de aplicar.
 * @param {Record<string, unknown>} settings
 * @param {{ hooks: Record<string, object[]> }} fragment
 * @returns {Record<string, unknown>}
 */
export function removeJsonHooks(settings, fragment) {
  const merged = structuredClone(settings)
  if (!merged.hooks) return merged

  for (const [event, entries] of Object.entries(fragment.hooks)) {
    const current = merged.hooks[event]
    if (!current) continue
    merged.hooks[event] = current.filter((c) => !entries.some((e) => isDeepStrictEqual(c, e)))
  }
  return merged
}

/** @param {string} text @returns {string} */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
