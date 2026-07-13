/** Implementação de GitStore em memória, para testes. Sem rede, sem git. */
export class FakeGitStore {
  /**
   * @param {string} [repoDir] caminho do clone, espelha `GitStore`
   * @param {string|null} [token] token de acesso, espelha `GitStore`
   * @param {string|null} [remoteUrl] URL do remote, espelha `GitStore`
   * @param {{ head?: string, remoteHead?: string, changed?: string[], modified?: string[], cloned?: boolean }} [state]
   */
  constructor(repoDir = null, token = null, remoteUrl = null, state = {}) {
    this.repoDir = repoDir
    this.token = token
    this.remoteUrl = remoteUrl
    this.state = {
      head: 'aaaa111',
      remoteHead: 'aaaa111',
      changed: [],
      modified: [],
      cloned: true,
      ...state,
    }
    this.calls = []
  }

  async clone(remoteUrl) { this.calls.push(`clone:${remoteUrl}`); this.remoteUrl = remoteUrl; this.state.cloned = true }
  async fetch() { this.calls.push('fetch') }
  async pull() { this.calls.push('pull'); this.state.head = this.state.remoteHead; this.state.changed = [] }
  async head() { return this.state.head }
  async remoteHead() { return this.state.remoteHead }
  async changedFiles() { return this.state.changed }
  async locallyModified() { return this.state.modified }
  async isClone() { return this.state.cloned }
}
