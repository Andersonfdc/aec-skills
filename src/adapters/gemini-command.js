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
  lines.push(...formatTomlPrompt(command.body.trimEnd()))
  return `${lines.join('\n')}\n`
}

/**
 * Emite o campo `prompt` como string TOML válida. Usa string literal `'''`
 * (sem processamento de escape) para que barras invertidas e aspas de paths,
 * regex ou trechos de código passem intactas. Só cai para a forma básica
 * `"""` (com escaping completo) quando o corpo contém `'''`, caso em que a
 * string literal não consegue representá-lo.
 * @param {string} body @returns {string[]}
 */
function formatTomlPrompt(body) {
  if (!body.includes("'''")) {
    return [`prompt = '''`, body, `'''`]
  }
  return [`prompt = """`, escapeToml(body), `"""`]
}

/** @param {string} text @returns {string} */
function escapeToml(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
