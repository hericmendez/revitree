# ReviTree

**ReviTree** é uma ferramenta de linha de comando (CLI) que transforma a estrutura de pastas e arquivos em uma árvore fácil de explorar, documentar e compartilhar. Exporte em **TXT**, **Markdown com diretórios colapsáveis** ou **HTML interativo** — sem frameworks, sem dependências npm e sem conexão com a internet.

Compatível com **Windows, Linux e macOS**, usando **Node.js 18 ou superior**.

## O que você pode fazer

- **Exportar uma árvore de diretórios** em TXT (`.txt`), Markdown (`.md`) ou HTML (`.html`). O padrão é TXT.
- **Expandir e recolher pastas** no Markdown e no visualizador HTML.
- **Buscar e ordenar no HTML** por título ou tamanho, sem gerar o arquivo novamente.
- **Exibir o tamanho dos arquivos e das pastas** com `--size`; o total de cada pasta considera seus arquivos e subpastas.
- **Controlar a profundidade** com `--depth`, sem limitar o cálculo dos tamanhos recursivos.
- **Ignorar arquivos e pastas** com `--ignore` (além de `.git` e `node_modules`, ignorados por padrão).
- **Abrir a localização no gerenciador de arquivos** pelo menu de contexto do HTML, quando executado com `--serve`.

## Instalação

### A partir do código-fonte

No terminal, dentro da pasta raiz do ReviTree:

```bash
npm install -g .
```

O comando `revitree` ficará disponível globalmente:

```bash
revitree --help
```

Também é possível executar a CLI sem instalar nada globalmente, a partir do diretório do projeto:

```bash
node bin/revitree.js --html
```

### Pelo npm (após a publicação)

Quando o pacote estiver publicado no registro npm:

```bash
npm install -g revitree
```

Para executar sem instalação global:

```bash
npx revitree --html
```

> **Nota:** a instalação pelo registro npm depende de a publicação do pacote ter sido concluída. `npm install -g .` funciona diretamente com o código-fonte local.

## Uso rápido

```bash
revitree                         # TXT da pasta atual (padrão)
revitree --size                  # TXT com tamanhos de arquivos e pastas
revitree --md --size             # Markdown colapsável com tamanhos recursivos
revitree --sort size             # pastas primeiro; maior tamanho primeiro dentro de cada grupo
revitree --md --sort title       # ordenação alfabética (padrão)
revitree --html --sort size      # HTML inicialmente em ordem de tamanho; permite alternar na UI
revitree --html --depth 2        # HTML até o segundo nível abaixo da raiz
revitree --html --size --depth 2 # HTML com tamanho total, incluindo níveis ocultos
revitree ./meu-projeto --html    # analisar outra pasta
revitree --html --serve          # HTML com "Abrir local" no menu de contexto
revitree --ignore .next,dist     # ignorar mais diretórios ou arquivos
revitree --output arvore.txt     # caminho/nome de saída personalizado
revitree --help                  # ajuda
```

### Opções

| Flag | Descrição |
| --- | --- |
| `--md` | Gera Markdown com pastas colapsáveis (`.md`). |
| `--html` | Gera explorador HTML (`.html`). |
| `--sort title\|size` | Ordena irmãos por **título** (padrão, A–Z) ou **tamanho decrescente**. Pastas permanecem antes dos arquivos; em empates, usa título. No HTML, define a opção inicial do controle de ordenação. |
| `--size` | Mostra os tamanhos dos arquivos e o total recursivo de cada pasta, em B/KiB/MiB/GiB etc. **Desligado por padrão.** |
| `--depth N` | Limita os níveis. Raiz = nível 0; `--depth 1` inclui os filhos diretos; `--depth 2` inclui até os netos. **Sem a flag, não há limite configurado.** |
| `--serve` | Somente com `--html`: inicia um servidor local para poder abrir a localização no gerenciador de arquivos. |
| `-o`, `--output ARQUIVO` | Define o caminho de saída, incluindo a extensão. |
| `--ignore NOMES` | Adiciona nomes a ignorar, separados por vírgula; repetível. |
| `-h`, `--help` | Exibe a ajuda. |

`--md` e `--html` são mutuamente exclusivos. Sem flag de formato, a saída é TXT. As opções podem aparecer antes ou depois do caminho. `--depth` aceita apenas inteiros não negativos; `0` mostra somente a raiz.

Por padrão, `.git` e `node_modules` são ignorados; outros arquivos ocultos são incluídos. Pastas aparecem antes dos arquivos, em ordem alfabética por padrão (`--sort title`). Com `--sort size`, as pastas são ordenadas por seu tamanho acumulado, do maior para o menor, e os arquivos também são ordenados do maior para o menor dentro do próprio grupo. Em empates, vale o título. O ReviTree utiliza 📁 para diretórios, 📄 para arquivos e 🔗 para links simbólicos. **Links simbólicos não são percorridos** para evitar ciclos.

O arquivo exportado é salvo no **diretório em que o comando foi executado**, a menos que `-o` seja informado. Os arquivos de saída padrão anteriores e a saída atual são excluídos da árvore para evitar autoindexação.

## Tamanhos de arquivos e pastas (`--size`)

```bash
revitree --size --depth 2
```

Exemplo TXT:

```text
📁 projeto/ (4.3 KiB)
├── 📁 src/ (1.5 KiB)
│   ├── 📁 components/ (0 B)
│   └── 📄 index.js (1.5 KiB)
├── 📄 README.md (860 B)
└── 📄 package.json (2 KiB)
```

O tamanho vem do sistema de arquivos no momento da varredura. A medida é em **bytes de arquivos comuns**, não espaço alocado em disco. As unidades são binárias: **1 KiB = 1.024 bytes**, **1 MiB = 1.048.576 bytes**. Em TXT, Markdown e HTML, **cada pasta exibe a soma de todos os arquivos dentro dela, recursivamente**, inclusive os arquivos das subpastas. A pasta raiz também mostra o total; pastas vazias mostram `0 B`.

- `--depth` limita a **visualização**, não o cálculo: `--size --depth 1` ainda soma o conteúdo que ficou oculto nos níveis mais profundos. Isso exige percorrer essas pastas mesmo quando elas não aparecem na árvore.
- `--ignore`, `.git`, `node_modules` e os arquivos de saída excluídos **não entram na soma**.
- Links simbólicos **não são seguidos nem somados**, para evitar duplicação e ciclos. Arquivos especiais também não entram na soma.
- Se não for possível ler algum arquivo ou diretório, o total da pasta e dos seus ancestrais é marcado como **parcial**, por exemplo `(≥ 2 MiB; parcial)`, indicando um valor mínimo encontrado, não um total exato. Arquivos com tamanho indisponível são exibidos como `indisponível`.
- Com `--size`, a varredura realiza consultas de metadados para obter os tamanhos e pode levar mais tempo em árvores grandes. Sem `--size`, não há **exibição** de tamanhos; entretanto, com `--sort size` ou `--html`, os tamanhos ainda são calculados para permitir a ordenação. A varredura pode levar mais tempo em árvores grandes.

No HTML, o tamanho aparece ao lado de cada pasta e arquivo, e o cabeçalho inclui o total da raiz. As contagens de itens continuam refletindo **somente os nós exibidos** (restringidos por `--depth`), enquanto os bytes refletem toda a árvore não ignorada.

## Ordenação (`--sort`)

```bash
revitree --sort title                    # padrão: título (A–Z, numeração natural)
revitree --sort size                     # tamanho decrescente (maior → menor)
revitree --md --sort size --depth 2      # subpastas consideradas no total
revitree --html --sort size              # HTML inicia com Tamanho selecionado
```

Em ambos os modos, **pastas vêm antes dos arquivos**. Cada grupo é ordenado independentemente; links simbólicos não são seguidos nem têm tamanho próprio contabilizado, por isso aparecem ao final do grupo de arquivos em `--sort size`. Valores indisponíveis ficam no final do grupo; tamanho parcial é ordenado pelo mínimo conhecido. Empates são resolvidos pelo título crescente, usando comparação numérica natural (por exemplo, `file2` antes de `file10`).

O `--sort size` calcula o tamanho **recursivo** das pastas mesmo sem `--size`; essa última flag controla apenas a exibição. O `--depth` limita os itens exibidos, não os bytes usados na ordenação.

## Visualizador HTML

```bash
revitree --html --size
```

Abre-se o arquivo `.html` gerado diretamente no navegador, sem servidor ou conexão com a internet. O arquivo inclui HTML, CSS e JavaScript e permite:

- expandir ou recolher pastas;
- alternar pela interface entre **Título** e **Tamanho ↓**, sem regenerar o HTML e mantendo as pastas abertas e a busca atual;
- buscar arquivos ou pastas sem distinguir maiúsculas/minúsculas ou acentos;
- ver estatísticas da árvore;
- usar o botão direito para abrir o menu de contexto e **copiar o caminho relativo**.

O HTML é um **snapshot**: se os arquivos mudarem, execute a CLI novamente para atualizar. Para a ordenação interativa funcionar **offline**, a CLI inclui os tamanhos em atributos numéricos internos mesmo sem `--size`; nesse caso, os valores ficam ocultos na tela. O `--sort` define a ordenação inicial, mas pode ser alterado no navegador. A ordenação reorganiza cada pasta individualmente, mantendo diretórios antes dos arquivos.

### Abrir local do arquivo (somente HTML com `--serve`)

Navegadores **não permitem** que uma página HTML estática inicie o Explorador de Arquivos do sistema. Para habilitar essa ação, execute:

```bash
revitree --html --serve
# ou, incluindo tamanhos e limitando a profundidade:
revitree ./meu-projeto --html --serve --size --depth 2
```

Além de gerar o `.html` offline, o ReviTree exibirá uma URL local semelhante a:

```text
Explorador local: http://127.0.0.1:54321/
```

**Abra a URL exibida**, não o arquivo `.html`, para usar o recurso. No explorador web, clique com o botão direito em um arquivo e escolha **Abrir local do arquivo**; nas pastas, **Abrir pasta no explorador**. O comportamento depende do sistema:

| Sistema | Comportamento |
| --- | --- |
| Windows | Abre a pasta ou seleciona o arquivo no Explorer. |
| macOS | Abre a pasta ou revela o arquivo no Finder. |
| Linux | Abre a pasta (ou a pasta que contém o arquivo) com o gerenciador padrão via `xdg-open`. A seleção do arquivo não é garantida. |

Mantenha o terminal com o servidor em execução. **Ctrl+C** encerra o serviço. A página HTML salva em disco permanece totalmente offline e, nela, a ação de abrir o explorador fica desabilitada; o menu ainda permite copiar o caminho relativo.

#### Segurança e privacidade

- O servidor usa apenas `127.0.0.1`, com porta livre selecionada automaticamente, sem acesso externo.
- A ação exige token temporário e origem da própria página local, além de limitar os caminhos aos itens existentes na árvore gerada.
- O servidor **não permite** ler, editar, excluir ou baixar conteúdos por HTTP: a ação apenas solicita ao sistema que abra a localização.
- O ReviTree não faz uploads nem utiliza serviços externos. Os arquivos exportados revelam nomes e estrutura de pastas — revise-os antes de compartilhá-los.
- Apenas execute `--serve` em seu próprio computador; não exponha o serviço via proxy/túnel.

## Desenvolvimento e testes

Para contribuir ou verificar uma alteração, execute os comandos na raiz do projeto:

```bash
npm test
```

O projeto usa apenas módulos nativos do Node.js. Os testes verificam exportações TXT/MD/HTML, tamanhos recursivos de pastas (inclusive níveis ocultos por `--depth`), ordenação por título e por tamanho, exclusões, links simbólicos, argumentos da CLI e permissões do servidor local.

## Estrutura

```text
revitree/
├── bin/revitree.js          # CLI e flags
├── src/tree.js              # leitura da árvore e tamanhos
├── src/txt.js               # exportação TXT
├── src/md.js                # exportação Markdown
├── src/html.js              # visualizador HTML
├── src/server.js            # servidor local / abrir localização
├── test/revitree.test.js    # testes automatizados
├── package.json
└── README.md
```

## Desinstalação

Se instalou globalmente, seja a partir do código-fonte ou do npm:

```bash
npm uninstall -g revitree
```
