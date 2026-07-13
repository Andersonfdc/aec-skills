# Smoke test manual

Task 16. Testes unitários provam que o CLI escreve os bytes certos; só um smoke test
end-to-end prova que ele funciona de verdade. Executado em 2026-07-13, HEAD `0ca20ea`
(depois: `6a380b4`, o fix de bug encontrado por este smoke test).

## Desvio em relação ao brief original

O brief pedia um repositório **privado no GitHub**. Sem credenciais da conta do
usuário, isso não foi feito. Em vez disso, foi usado um **repositório git bare
local** (`git init` + `git clone --bare`), que exercita exatamente o mesmo caminho de
código (`clone` → `list` → `add` → `link`) sem rede e sem credenciais.

## Isolamento do ambiente real

Todo comando rodou contra um `USERPROFILE`/`HOME` falso, criado sob o diretório de
scratchpad da sessão — nunca o `C:\Users\aftec` real:

```
FakeHome = <scratch>\fake-home
mkdir FakeHome\.claude FakeHome\.copilot FakeHome\.codex FakeHome\.gemini
$env:USERPROFILE = $FakeHome
$env:HOME = $FakeHome
node src\cli.js <comando>
```

Confirmado ao final: `C:\Users\aftec\.aec-skills` (o store real) **nunca existiu**
durante nem depois da sessão. `~/.claude`, `~/.copilot`, `~/.codex`, `~/.gemini` reais
não foram tocados — todo I/O do CLI ficou dentro do `FakeHome`.

Detalhe de execução: o `gh` CLI da máquina está autenticado com uma conta real. Para
não fazer `resolveToken()` chamar `gh auth token` e obter um PAT de verdade, o
diretório do GitHub CLI foi removido do `PATH` só nesses comandos, e `GITHUB_TOKEN`
foi setado para um valor falso (`smoke-test-fake-token`). O clone local não usa esse
token de qualquer forma (transporte é `file`, não `https`).

## Repositório de biblioteca usado

```
<scratch>/lib-src/
  skills/
    hello-aec/
      SKILL.md
```

`SKILL.md` idêntico ao pedido no brief (`name: hello-aec`, descrição de teste, corpo
"Responda exatamente: ..."). Commit local, depois `git clone --bare lib-src lib.git`.

## Bug encontrado e corrigido

**`login` falhava sempre numa instalação nova**, antes de qualquer fix.

- Comando: `node src/cli.js login <path-do-bare-repo>`
- Erro: `erro: git não encontrado no PATH — instale em https://git-scm.com/downloads`
- Isso é enganoso: `git --version` funcionava normalmente no mesmo shell.

Causa raiz: `GitStore.clone()` (`src/git-store.js`) roda `git clone` com `cwd` igual
ao diretório pai de `repoDir` — ou seja, `~/.aec-skills`. Numa instalação nova esse
diretório **não existe ainda** (nada o cria antes do primeiro `clone`). `execFile`
falha com `ENOENT` porque o `cwd` não existe, e o `catch` de `#git()` trata qualquer
`ENOENT` como "git não está instalado" — a mesma `error.code` das duas situações.

Os testes unitários existentes nunca cobriram isso porque `tmpHome()` sempre cria um
diretório real e as instâncias de `GitStore` nos testes clonam para uma
*subpasta* dele — o pai sempre já existe. Só o smoke test, que começa de um
`HOME` completamente vazio, expôs a lacuna.

**Fix** (`src/git-store.js`, commit `6a380b4`, separado deste commit de docs):
`clone()` agora roda `mkdir(cwd, { recursive: true })` antes de invocar `git`. Teste
de regressão adicionado em `test/git-store.test.js` reproduzindo exatamente esse
cenário (clone com o pai de `repoDir` inexistente). `npm test` depois do fix: 137
testes, 135 passam, 2 skipped (Windows) — sem falhas.

Depois do fix, o smoke test completo abaixo passou do início ao fim.

## Procedimento e resultados observados

| # | Comando | Exit code | O que foi observado |
|---|---|---|---|
| 1 | `login <path do bare repo>` | 0 | `✓ biblioteca clonada em ...\.aec-skills\repo`. Criou `FakeHome\.aec-skills\{repo,config.json}`. `repo\skills\hello-aec\SKILL.md` presente e íntegro (UTF-8 confirmado por leitura binária — o texto exibido com acentos trocados no console do PowerShell era só codepage do terminal, não um bug no arquivo). |
| 2 | `list` | 0 | Uma linha: `  skill    hello-aec    Skill de teste do aec-skills. Use quando o usuário pedir para validar a instalação.` — sem marca `✓` (nada instalado ainda). |
| 3 | `add hello-aec` | 0 | `✓ hello-aec → claude`, `✓ hello-aec → copilot`, `✓ hello-aec → codex`, `· hello-aec → gemini: gemini não suporta skill`. Criou link (reparse point, `d----l`) em `FakeHome\.claude\skills\hello-aec`, `FakeHome\.copilot\skills\hello-aec`, `FakeHome\.codex\skills\hello-aec`. Gemini não tem `skillsDir`, então foi pulado como esperado — mas `FakeHome\.gemini\GEMINI.md` foi criado com o bloco `<!-- aec-skills:start -->...<!-- aec-skills:end -->` indexando a skill. `installed.json` ganhou 3 entradas (claude, copilot, codex), todas `mode: "link"`. |
| 4 | `status` | 0 | `aec-skills — tudo em dia.` (esperado: acabamos de instalar, nada mudou desde então). |
| 5 | `remove hello-aec` | 0 | `✓ hello-aec removido de 3 harness(es)`. As três pastas de skill linkadas desapareceram; `installed.json` voltou a `[]`. |
| 6 | `uninstall --yes` | 0 | `✓ 0 artefato(s) removido(s) e store apagado` (0 porque o `remove` do passo 5 já tinha zerado `installed.json` — o store em si, `FakeHome\.aec-skills`, foi apagado, confirmado com `Test-Path` → `False`). Bloco `aec-skills` removido de `GEMINI.md`, arquivo ficou vazio (só continha o bloco). |

Todos os 6 comandos citados no brief de segurança da task rodaram com exit code 0 e
produziram exatamente o efeito esperado no `FakeHome`. Nenhum comando tocou o
`~/.aec-skills`, `~/.claude`, `~/.copilot`, `~/.codex` ou `~/.gemini` reais da máquina.

## O que este smoke test NÃO verifica (precisa de verificação manual do usuário)

Este smoke test roda o CLI isoladamente e inspeciona o sistema de arquivos resultante.
Ele **não** abre nenhum dos harnesses de verdade, então não prova que eles carregam o
artefato instalado. Pendente de verificação manual numa máquina real, com os
harnesses de verdade instalados:

| Harness | Verificação pendente |
|---|---|
| Claude Code | `/hello-aec` aparece no menu de skills do Claude Code |
| GitHub Copilot (VS Code) | a skill aparece no menu `/` do Copilot Chat |
| GitHub Copilot CLI | `copilot` → a skill é listada |
| Codex CLI | a skill é listada |
| Gemini CLI | `/memory show` mostra o bloco `aec-skills` dentro de `GEMINI.md` já carregado |

Essas cinco linhas só podem ser confirmadas lançando cada ferramenta de verdade — algo
fora do alcance deste ambiente. Ficam registradas aqui como pendência, não como
suposição.
