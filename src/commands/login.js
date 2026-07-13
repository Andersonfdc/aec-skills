import { GitStore } from '../git-store.js'
import { resolveToken } from '../auth.js'
import { readConfig, writeConfig } from '../state.js'
import { storePaths } from '../paths.js'

/**
 * Autentica e clona a biblioteca. O token nunca é impresso.
 *
 * Constrói sua própria `GitStore` em vez de usar `deps.gitStore`: o token só
 * é conhecido depois de `resolveToken`, e `GitStore` exige token+remoteUrl no
 * construtor (contrato de segurança — ver `git-store.js`). `deps.GitStoreClass`
 * permite injetar uma implementação fake nos testes; em produção cai na
 * `GitStore` real. `deps` também é repassado como `io` para `resolveToken` —
 * seus campos opcionais (`readGhToken`, `input`, `output`) permitem testar
 * sem chamar o `gh` CLI real nem prompts interativos.
 *
 * @param {string} homeDir
 * @param {{ _?: string[] }} args primeiro item: a URL do repositório
 * @param {{ log: (line: string) => void, env: NodeJS.ProcessEnv, GitStoreClass?: new (repoDir: string, token?: string|null, remoteUrl?: string|null) => import('../git-store.js').GitStore, readGhToken?: () => Promise<string|null>, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} deps
 * @returns {Promise<number>}
 */
export async function runLogin(homeDir, args, deps) {
  const config = await readConfig(homeDir)
  const remoteUrl = args._?.[0] ?? config.remoteUrl
  if (!remoteUrl) {
    deps.log('informe a URL do repositório: npx aec-skills login https://github.com/org/lib.git')
    return 1
  }

  const token = await resolveToken(deps.env, deps)
  const { repo } = storePaths(homeDir)
  const StoreCtor = deps.GitStoreClass ?? GitStore
  const gitStore = new StoreCtor(repo, token, remoteUrl)

  if (await gitStore.isClone()) {
    deps.log('biblioteca já clonada — rode `npx aec-skills update` para atualizar')
    return 0
  }

  await gitStore.clone(remoteUrl)
  await writeConfig(homeDir, { ...config, remoteUrl, token })

  deps.log(`✓ biblioteca clonada em ${repo}`)
  deps.log('rode `npx aec-skills list` para ver o que há disponível')
  return 0
}
