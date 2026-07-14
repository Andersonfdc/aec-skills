import { rm } from 'node:fs/promises'
import { storePaths } from './paths.js'
import { readConfig, writeConfig } from './state.js'
import { DEFAULT_REMOTE_URL, LEGACY_REMOTE_URLS } from './constants.js'

/**
 * A biblioteca já morou no mesmo repositório que o CLI. Quem fez `login` naquela
 * época tem a URL do monorepo gravada no `config.json` — e ela **vence** a URL
 * padrão para sempre (ver `cli.js`), então a máquina fica presa numa biblioteca
 * que não existe mais.
 *
 * O sintoma é traiçoeiro: o store velho ainda tem as skills antigas em disco, o
 * `login` diz "já clonada" e sai, e o `update` — que é o que a mensagem manda
 * fazer — puxa do repositório do CLI, que não tem mais `skills/`, e deixa a
 * biblioteca **vazia**.
 * @param {string} remoteUrl
 * @returns {boolean}
 */
export function isLegacyRemote(remoteUrl) {
  if (typeof remoteUrl !== 'string') return false
  const normalized = normalize(remoteUrl)
  return LEGACY_REMOTE_URLS.some((legacy) => normalize(legacy) === normalized)
}

/**
 * Repara um store preso na URL antiga: apaga o clone e reaponta a config para a
 * biblioteca de verdade. O token é preservado — a credencial não mudou, só o
 * endereço. Quem clonou de uma URL de terceiro (`login <url>`) nunca é tocado.
 *
 * Pede confirmação porque apagar o store descarta qualquer edição local que o
 * usuário tenha feito dentro dele.
 * @param {string} homeDir
 * @param {{ log: (line: string) => void, confirm?: (q: string) => Promise<boolean> }} deps
 * @returns {Promise<boolean>} `true` quando o store foi apagado e a config reapontada
 */
export async function migrateLegacyStore(homeDir, deps) {
  const config = await readConfig(homeDir)
  if (!isLegacyRemote(config.remoteUrl)) return false

  deps.log('')
  deps.log('  A biblioteca mudou de endereço.')
  deps.log('')
  deps.log('  Esta máquina aponta para o repositório antigo, de quando o CLI e a')
  deps.log('  biblioteca viviam juntos. É por isso que você só enxerga as skills')
  deps.log('  velhas — e um `update` daqui deixaria a biblioteca vazia.')
  deps.log('')
  deps.log(`  Conserto: apagar o store local e clonar de ${DEFAULT_REMOTE_URL}`)
  deps.log('  Isso descarta qualquer edição que você tenha feito dentro do store.')
  deps.log('  Suas skills instaladas são religadas no próximo `add`/`update`.')
  deps.log('')

  const confirm = deps.confirm ?? (async () => false)
  if (!(await confirm('reparar agora? [y/N] '))) {
    deps.log('cancelado — a biblioteca continuará desatualizada')
    return false
  }

  await rm(storePaths(homeDir).repo, { recursive: true, force: true })
  await writeConfig(homeDir, { ...config, remoteUrl: DEFAULT_REMOTE_URL })
  deps.log('✓ store reapontado — clonando a biblioteca')
  return true
}

/** @param {string} url @returns {string} */
function normalize(url) {
  return url.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '')
}
