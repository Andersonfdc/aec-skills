#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { GitStore } from './git-store.js'
import { storePaths } from './paths.js'
import { readConfig } from './state.js'
import { runLogin } from './commands/login.js'
import { runList } from './commands/list.js'
import { runAdd } from './commands/add.js'
import { runRemove } from './commands/remove.js'
import { runStatus } from './commands/status.js'
import { runUpdate } from './commands/update.js'
import { runUninstall } from './commands/uninstall.js'
import { runInstall } from './commands/install.js'
import { isLegacyRemote, migrateLegacyStore } from './migrate.js'

const HELP = `aec-skills <comando> [opções]

Comandos:
  install               instalador interativo (padrão quando não há comando)
  login                 autentica e clona a biblioteca
  list                  lista as skills e agents disponíveis
  add <nome...>         instala nos harnesses detectados (--all para tudo)
  remove <nome...>      desinstala
  status                mostra o que mudou na biblioteca
  update                aplica as atualizações
  uninstall             remove tudo, inclusive o store

Opções:
  --harness=<lista>     claude,copilot,codex,gemini (padrão: autodetectar)
  --version             imprime a versão`

const COMMANDS = {
  install: runInstall,
  login: runLogin,
  list: runList,
  add: runAdd,
  remove: runRemove,
  status: runStatus,
  update: runUpdate,
  uninstall: runUninstall,
}

/**
 * Ponto de entrada do CLI.
 * @param {string[]} argv argumentos, sem `node` e sem o caminho do script
 * @param {{ log?: (line: string) => void, homeDir?: string }} [io]
 * @returns {Promise<number>} exit code
 */
export async function runCli(argv, io = {}) {
  const log = io.log ?? console.log
  // Injetável para que o teste alcance os caminhos que hoje só o stdin real abre
  // (migração do store legado, confirmação de hook, atualização no instalador).
  const confirm = io.confirm ?? askYesNo

  if (argv.includes('--version')) {
    log(await readVersion())
    return 0
  }
  // Sem comando, num TTY, o padrão é o instalador interativo. Num pipe ou na CI
  // não há como desenhar um menu — aí o padrão continua sendo o help.
  const [command] = argv
  const interactive = io.isTTY ?? process.stdin.isTTY
  if (!command && !interactive) {
    log(HELP)
    return 1
  }

  const run = command ? COMMANDS[command] : runInstall
  if (!run) {
    log(`comando desconhecido: ${command}`)
    log(HELP)
    return 1
  }

  const homeDir = io.homeDir ?? homedir()
  const args = parseCommandArgs(argv.slice(1))

  // Repara, antes de qualquer comando, uma máquina cujo config.json ainda aponta
  // para o repositório de quando o CLI e a biblioteca eram um só. Sem isto ela
  // fica presa mostrando as skills velhas, e um `update` a deixaria vazia.
  // Num pipe não há como confirmar: a migração só explica e não apaga nada.
  if (isLegacyRemote((await readConfig(homeDir)).remoteUrl)) {
    await migrateLegacyStore(homeDir, { log, confirm: interactive ? confirm : undefined })
  }

  // A GitStore precisa da URL confiável lida do NOSSO config.json, nunca de
  // `git remote get-url origin` — ver o contrato de segurança em git-store.js.
  const config = await readConfig(homeDir)
  const gitStore = new GitStore(storePaths(homeDir).repo, config.token ?? null, config.remoteUrl ?? null)
  const deps = { log, gitStore, env: process.env, confirm, isTTY: interactive }

  try {
    // runStatus tem assinatura (homeDir, gitStore, io); os demais (homeDir, args, deps).
    return command === 'status'
      ? await runStatus(homeDir, gitStore, { log })
      : await run(homeDir, args, deps)
  } catch (error) {
    log(`erro: ${error.message}`)
    return 1
  }
}

/**
 * @param {string[]} argv
 * @returns {{ _: string[], all?: boolean, force?: boolean, yes?: boolean, harness?: string }}
 */
function parseCommandArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      all: { type: 'boolean' },
      force: { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      harness: { type: 'string' },
    },
    allowPositionals: true,
  })
  return { ...values, _: positionals }
}

/**
 * @param {string} question
 * @returns {Promise<boolean>}
 */
async function askYesNo(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(question)
    return answer.trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}

/** @returns {Promise<string>} */
async function readVersion() {
  const pkgUrl = new URL('../package.json', import.meta.url)
  const pkg = JSON.parse(await readFile(fileURLToPath(pkgUrl), 'utf8'))
  return pkg.version
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code })
}
