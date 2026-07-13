import { serializeFrontmatter } from '../frontmatter.js'

/**
 * Converte um agent do Claude Code para o formato `.agent.md` do Copilot.
 *
 * `tools` é omitido de propósito: as taxonomias de tools dos dois harnesses são
 * diferentes (`Read`/`Grep`/`Bash` vs `search/codebase`/`web/fetch`) e uma tradução
 * parcial produziria uma allowlist errada — restritiva demais ou permissiva demais.
 * Omitido significa "todas as tools", que é o default documentado do Copilot.
 * Quem precisa de controle fino declara `targets.copilot.tools` no próprio agent.
 *
 * @param {import('../library.js').Artifact} agent
 * @returns {string} conteúdo do arquivo `.agent.md`
 */
export function toCopilotAgent(agent) {
  const { targets, tools, ...rest } = agent.attrs
  const override = targets?.copilot?.tools

  const attrs = { ...rest }
  if (override) attrs.tools = override

  return serializeFrontmatter(attrs, agent.body)
}
