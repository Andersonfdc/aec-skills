const NAME_PATTERN = /^[a-z0-9-]+$/
const NAME_MAX = 64
const DESCRIPTION_MAX = 1024

/**
 * Valida o frontmatter de um SKILL.md.
 * @param {Record<string, unknown>} attrs
 * @param {string} dirName nome da pasta que contém o SKILL.md
 * @returns {string[]} mensagens de erro; vazio quando válido
 */
export function validateSkill(attrs, dirName) {
  const errors = requireNameAndDescription(attrs)
  if (typeof attrs.name !== 'string') return errors

  errors.push(...checkNameShape(attrs.name))
  if (attrs.name !== dirName) {
    errors.push(`name "${attrs.name}" difere da pasta "${dirName}" — precisam ser iguais`)
  }
  return errors
}

/**
 * Valida o frontmatter de um agent.
 *
 * Sem teto de tamanho na `description`, ao contrário da skill: o limite de 1024 é
 * documentado para skills, e aplicá-lo a agents rejeitava conteúdo que os harnesses
 * aceitam. Um agent com blocos `<example>` na descrição — padrão comum, e o que o
 * próprio Claude Code carrega — passa fácil dos 3000 caracteres.
 * @param {Record<string, unknown>} attrs
 * @param {string} fileName nome do arquivo, para a mensagem de erro
 * @returns {string[]}
 */
export function validateAgent(attrs, fileName) {
  const errors = []
  if (typeof attrs.description !== 'string' || attrs.description.length === 0) {
    errors.push(`${fileName}: campo "description" é obrigatório`)
  }
  return errors
}

/** @param {Record<string, unknown>} attrs @returns {string[]} */
function requireNameAndDescription(attrs) {
  const errors = []
  if (typeof attrs.name !== 'string' || attrs.name.length === 0) {
    errors.push('campo "name" é obrigatório')
  }
  errors.push(...checkDescription(attrs.description, ''))
  return errors
}

/** @param {string} name @returns {string[]} */
function checkNameShape(name) {
  const errors = []
  if (!NAME_PATTERN.test(name)) {
    errors.push(`"name" aceita apenas [a-z0-9-], recebido "${name}"`)
  }
  if (name.length > NAME_MAX) {
    errors.push(`"name" tem máximo 64 caracteres, recebido ${name.length}`)
  }
  return errors
}

/** @param {unknown} description @param {string} prefix @returns {string[]} */
function checkDescription(description, prefix) {
  const errors = []
  if (typeof description !== 'string' || description.length === 0) {
    errors.push(`${prefix}campo "description" é obrigatório`)
  } else if (description.length > DESCRIPTION_MAX) {
    errors.push(`${prefix}"description" tem máximo 1024 caracteres, recebido ${description.length}`)
  }
  return errors
}
