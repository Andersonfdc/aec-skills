/** Implementação de GitStore em memória, para testes. Sem rede, sem git. */
export class FakeGitStore {
  /**
   * @param {{ head?: string, remoteHead?: string, changed?: string[], modified?: string[], cloned?: boolean }} [state] estado inicial seedado pelo teste
   */
  constructor(state = {}) {
    this.state = {
      head: 'aaaa111',
      remoteHead: 'aaaa111',
      changed: [],
      modified: [],
      cloned: true,
      ...state,
    }
    this.remoteUrl = null
    this.calls = []
  }

  /** @param {string} remoteUrl @returns {Promise<void>} */
  async clone(remoteUrl) { this.calls.push(`clone:${remoteUrl}`); this.remoteUrl = remoteUrl; this.state.cloned = true }

  /** @returns {Promise<void>} */
  async fetch() { this.calls.push('fetch') }

  /** @returns {Promise<void>} */
  async pull() { this.calls.push('pull'); this.state.head = this.state.remoteHead; this.state.changed = [] }

  /** @returns {Promise<void>} */
  async resetHard() { this.calls.push('reset'); this.state.modified = [] }

  /** @returns {Promise<string>} */
  async head() { return this.state.head }

  /** @returns {Promise<string>} */
  async remoteHead() { return this.state.remoteHead }

  /** @returns {Promise<string[]>} */
  async changedFiles() { return this.state.changed }

  /** @returns {Promise<string[]>} */
  async locallyModified() { return this.state.modified }

  /** @returns {Promise<boolean>} */
  async isClone() { return this.state.cloned }
}
