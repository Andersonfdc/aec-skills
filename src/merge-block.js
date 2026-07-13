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
  return existing.replace(BLOCK_PATTERN, '')
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
 * @param {Record<string, unknown>} settings
 * @param {{ hooks: Record<string, object[]> }} fragment
 * @returns {Record<string, unknown>}
 */
export function removeJsonHooks(settings, fragment) {
  const merged = structuredClone(settings)
  if (!merged.hooks) return merged

  for (const [event, entries] of Object.entries(fragment.hooks)) {
    const current = merged.hooks[event] ?? []
    merged.hooks[event] = current.filter((c) => !entries.some((e) => isDeepStrictEqual(c, e)))
  }
  return merged
}

/** @param {string} text @returns {string} */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
