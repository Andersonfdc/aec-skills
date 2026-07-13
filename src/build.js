import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storePaths } from './paths.js'
import { toCopilotAgent } from './adapters/copilot-agent.js'
import { toGeminiCommand } from './adapters/gemini-command.js'
import { toGeminiIndex } from './adapters/gemini-index.js'

/**
 * Regenera todos os derivados a partir do clone. Destrutivo apenas dentro de
 * `~/.aec-skills/build/`, e idempotente: rodar duas vezes produz o mesmo resultado.
 *
 * Skills não geram derivado — são ligadas direto de `repo/skills/` para os três
 * harnesses que leem SKILL.md nativamente.
 *
 * @param {string} homeDir
 * @param {import('./library.js').Artifact[]} artifacts
 * @returns {Promise<void>}
 */
export async function buildDerivatives(homeDir, artifacts) {
  const { repo, build } = storePaths(homeDir)
  await rm(build, { recursive: true, force: true })

  const skills = artifacts.filter((a) => a.kind === 'skill')
  const agents = artifacts.filter((a) => a.kind === 'agent')
  const commands = artifacts.filter((a) => a.kind === 'command')

  await writeAgents(build, agents)
  await writeCommands(build, commands)
  await writeGeminiIndex(build, skills, repo)
}

/** @param {string} build @param {import('./library.js').Artifact[]} agents */
async function writeAgents(build, agents) {
  const dir = path.join(build, 'copilot', 'agents')
  await mkdir(dir, { recursive: true })
  for (const agent of agents) {
    await writeFile(path.join(dir, `${agent.name}.agent.md`), toCopilotAgent(agent))
  }
}

/** @param {string} build @param {import('./library.js').Artifact[]} commands */
async function writeCommands(build, commands) {
  const dir = path.join(build, 'gemini', 'commands')
  await mkdir(dir, { recursive: true })
  for (const command of commands) {
    await writeFile(path.join(dir, `${command.name}.toml`), toGeminiCommand(command))
  }
}

/** @param {string} build @param {import('./library.js').Artifact[]} skills @param {string} repo */
async function writeGeminiIndex(build, skills, repo) {
  const dir = path.join(build, 'gemini')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'index.md'), `${toGeminiIndex(skills, repo)}\n`)
}
