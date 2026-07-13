import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const DELIMITER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Separa o frontmatter YAML do corpo markdown.
 * @param {string} source conteúdo completo do arquivo
 * @returns {{ attrs: Record<string, unknown>, body: string }}
 * @throws {Error} quando o bloco de frontmatter existe mas o YAML é inválido
 */
export function parseFrontmatter(source) {
  const match = DELIMITER.exec(source)
  if (!match) return { attrs: {}, body: source }

  const [block, yamlText] = match
  try {
    const attrs = parseYaml(yamlText) ?? {}
    return { attrs, body: source.slice(block.length) }
  } catch (cause) {
    throw new Error(`frontmatter YAML inválido: ${cause.message}`, { cause })
  }
}

/**
 * Reconstrói um arquivo a partir de atributos e corpo.
 * @param {Record<string, unknown>} attrs
 * @param {string} body
 * @returns {string}
 */
export function serializeFrontmatter(attrs, body) {
  const yamlText = stringifyYaml(attrs).trimEnd()
  return `---\n${yamlText}\n---\n${body}`
}
