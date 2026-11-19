# InkOS

Sistema operacional web experimental em **Rust / WebAssembly** com interface desktop inspirada no **macOS** e **COSMIC / MocaccinoOS**, integrado aos aplicativos do **InkDOS Hub**.

🔗 **Acesse online:** [https://inkos-5k7.pages.dev](https://inkos-5k7.pages.dev)

---

## Recursos Principais

- **Kernel & Runtime WebAssembly (`InkSoC`):** compilado em Rust (`wasm32-unknown-unknown`) com suporte a `SharedArrayBuffer` e isolamento de origem (`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`).
- **Gerenciador de Janelas (`WindowManager`):** janelas arrastáveis, redimensionáveis em 8 direções, botões de semáforo estilo macOS (fechar, minimizar, maximizar), múltiplos **Workspaces** e **Dock** flutuante.
- **Sistema de Arquivos Virtual (`VFS`):** armazenamento persistente no navegador via **OPFS** / **IndexedDB** integrado ao **Finder** e aos aplicativos do **InkDOS Hub**.
- **Aplicativos Nativos:**
  - **Finder:** gerenciamento de pastas/arquivos, importação/exportação e envio direto de arquivos para os apps do Hub.
  - **InkBrowser:** navegação web e visualização de arquivos internos via protocolo `vfs://`.
  - **InkShell (Terminal):** shell interativo integrado ao VFS.
  - **CMD & Instalador `.EXE`:** prompt de comandos e simulação/execução de pacotes.
  - **Monitor de Sistema:** acompanhamento em tempo real de FPS, memória, armazenamento e processos/janelas ativas.
  - **Configurações:** seleção de planos de fundo (nativos ou imagem local/VFS), temas (**Mocha / Latte**), cor de destaque e escala da Dock.

---

## Estrutura do Projeto

```text
├── inkos/
│   ├── Cargo.toml          # Crate Rust do kernel Wasm
│   ├── src/                # Código-fonte Rust (MMU, syscalls, runtime)
│   └── web/                # Interface desktop, VFS, WM e apps nativos
│       ├── index.html
│       ├── icons.svg
│       ├── sw.js
│       ├── theme/catppuccin.css
│       └── js/
│           ├── wm.js
│           ├── vfs.js
│           ├── appload.js
│           └── apps/       # finder, browser, shell, cmd-exe, monitor, settings
└── scripts/
    └── build.sh            # Script de build Wasm + empacotamento para Cloudflare Pages
