/**
 * Converte um command markdown para o formato `.toml` do Gemini CLI.
 * O campo `prompt` é obrigatório no Gemini; `description` é opcional.
 * @param {import('../library.js').Artifact} command
 * @returns {string} conteúdo do arquivo `.toml`
 */
export function toGeminiCommand(command) {
  const lines = []
  if (typeof command.attrs.description === 'string') {
    lines.push(`description = "${escapeToml(command.attrs.description)}"`)
  }
  lines.push('prompt = """')
  lines.push(command.body.trimEnd())
  lines.push('"""')
  return `${lines.join('\n')}\n`
}

/** @param {string} text @returns {string} */
function escapeToml(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
