#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const HELP = `aec-skills <comando> [opções]

Comandos:
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

/**
 * Ponto de entrada do CLI.
 * @param {string[]} argv argumentos, sem `node` e sem o caminho do script
 * @param {{ log?: (line: string) => void }} [io]
 * @returns {Promise<number>} exit code
 */
export async function runCli(argv, io = {}) {
  const log = io.log ?? console.log

  if (argv.includes('--version')) {
    log(await readVersion())
    return 0
  }
  const [command] = argv
  if (!command) {
    log(HELP)
    return 1
  }
  log(`comando desconhecido: ${command}`)
  return 1
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
