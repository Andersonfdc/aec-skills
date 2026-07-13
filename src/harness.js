import { access } from 'node:fs/promises'
import path from 'node:path'

/** @typedef {'claude'|'copilot'|'codex'|'gemini'} HarnessId */

/**
 * Tabela dos harnesses suportados. Campos `null` significam
 * "o harness não tem esse conceito" — ver o spec, seção Adaptadores.
 */
export const HARNESSES = {
  claude: {
    id: 'claude',
    root: (h) => path.join(h, '.claude'),
    skillsDir: (h) => path.join(h, '.claude', 'skills'),
    agentsDir: (h) => path.join(h, '.claude', 'agents'),
    commandsDir: (h) => path.join(h, '.claude', 'commands'),
    agentExt: '.md',
    contextFile: null,
  },
  copilot: {
    id: 'copilot',
    root: (h) => path.join(h, '.copilot'),
    skillsDir: (h) => path.join(h, '.copilot', 'skills'),
    agentsDir: (h) => path.join(h, '.copilot', 'agents'),
    commandsDir: null,
    agentExt: '.agent.md',
    contextFile: null,
  },
  codex: {
    id: 'codex',
    root: (h) => path.join(h, '.codex'),
    skillsDir: (h) => path.join(h, '.codex', 'skills'),
    agentsDir: null,
    commandsDir: null,
    agentExt: null,
    contextFile: null,
  },
  gemini: {
    id: 'gemini',
    root: (h) => path.join(h, '.gemini'),
    skillsDir: null,
    agentsDir: null,
    commandsDir: (h) => path.join(h, '.gemini', 'commands'),
    agentExt: null,
    contextFile: (h) => path.join(h, '.gemini', 'GEMINI.md'),
  },
}

/**
 * Um harness é considerado presente quando seu diretório raiz existe.
 * @param {string} homeDir
 * @returns {Promise<HarnessId[]>}
 */
export async function detectHarnesses(homeDir) {
  const ids = Object.keys(HARNESSES)
  const present = await Promise.all(ids.map((id) => exists(HARNESSES[id].root(homeDir))))
  return ids.filter((_, i) => present[i])
}

/**
 * Resolve a lista de harnesses alvo: a flag `--harness` vence a detecção.
 * @param {string|undefined} flag lista separada por vírgula
 * @param {string} homeDir
 * @returns {Promise<HarnessId[]>}
 * @throws {Error} quando a flag cita um harness inexistente
 */
export async function resolveHarnesses(flag, homeDir) {
  if (!flag) return detectHarnesses(homeDir)

  const known = Object.keys(HARNESSES).sort()
  const requested = flag.split(',').map((s) => s.trim()).filter(Boolean)
  for (const id of requested) {
    if (!known.includes(id)) {
      throw new Error(`harness desconhecido: "${id}"\nsuportados: ${known.join(', ')}`)
    }
  }
  return requested
}

/** @param {string} dir @returns {Promise<boolean>} */
async function exists(dir) {
  try {
    await access(dir)
    return true
  } catch {
    return false
  }
}
