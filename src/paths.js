import path from 'node:path'

/**
 * Caminhos do store, derivados do diretório home.
 * @param {string} homeDir
 * @returns {{ store: string, repo: string, build: string, configFile: string, installedFile: string }}
 */
export function storePaths(homeDir) {
  const store = path.join(homeDir, '.aec-skills')
  return {
    store,
    repo: path.join(store, 'repo'),
    build: path.join(store, 'build'),
    configFile: path.join(store, 'config.json'),
    installedFile: path.join(store, 'installed.json'),
  }
}
