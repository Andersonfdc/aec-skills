import path from 'node:path'

/**
 * Gera o índice de skills para o bloco marcado do GEMINI.md.
 *
 * O GEMINI.md é injetado em TODO prompt — importar o corpo das skills colocaria
 * todas elas dentro de cada requisição. Por isso o bloco carrega apenas nome,
 * descrição e caminho, e instrui o Gemini a ler o arquivo sob demanda. Emula o
 * carregamento progressivo que os outros harnesses têm nativo.
 *
 * @param {import('../library.js').Artifact[]} skills
 * @param {string} repoDir raiz do clone, para montar os caminhos absolutos
 * @returns {string} corpo do bloco (sem os marcadores)
 */
export function toGeminiIndex(skills, repoDir) {
  if (skills.length === 0) return '## Skills disponíveis\n\nNenhuma skill instalada.'

  const lines = skills.map((skill) => {
    const file = path.posix.join(repoDir, 'skills', skill.name, 'SKILL.md')
    return `- **${skill.name}** — ${skill.attrs.description}\n  → \`${file}\``
  })

  return [
    '## Skills disponíveis',
    '',
    'Quando a tarefa casar com uma descrição abaixo, leia o arquivo indicado antes de agir.',
    '',
    ...lines,
  ].join('\n')
}
