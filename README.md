# Fasticket

Aplicativo desktop para **automação de criação e conclusão de tickets de suporte** no portal Praxio.

## O que é

O Fasticket é um cliente batch que permite criar e concluir tickets no portal Praxio de forma automatizada. Ele resolve o problema de analistas que precisam abrir muitos tickets manualmente, repetitivamente e com risco de erros.

## Funcionalidades

- **Criação offline** — monte tickets sem estar conectado ao portal
- **Fila de envio** — salve vários rascunhos, edite ou exclua antes de enviar
- **Envio automatizado** — bot Playwright loga, preenche e submete os tickets automaticamente
- **Conclusão automática** — marque o ticket como concluído e o bot preenche trâmite, natureza, prioridade e submete como Concluído
- **Histórico** — acompanhe os últimos 5 tickets criados
- **Configuração** — salve suas credenciais do portal localmente

## Pré-requisitos

- [Node.js](https://nodejs.org/) (v16+)
- npm

## Instalação

```bash
# Clone o repositório
git clone https://github.com/Rafael06Correa/Fasticket.git
cd Fasticket

# Instale as dependências
npm install

# Rebuild do electron-rebuild (necessário para o Playwright)
npx electron-rebuild
```

## Execução

```bash
npm start
```

## Estrutura do projeto

```
Fasticket/
├── main.js                    # Processo principal do Electron
├── preload.js                 # Bridge IPC seguro
├── bot/
│   └── playwright-bot.js      # Automação headless (Playwright)
├── renderer/
│   ├── index.html             # Interface principal
│   ├── renderer.js            # Lógica do frontend
│   └── renderer.css           # Estilos (tema dark)
├── db/
│   ├── fila.db                # Banco de dados da fila
│   ├── historico.db           # Banco de dados do histórico
│   └── credenciais.db         # Banco de dados das credenciais
└── referencias/
    └── referências visuais do portal
```

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 28 |
| UI | HTML/CSS/JS vanilla |
| Automação | Playwright (Chromium headless) |
| Banco local | NeDB |

## Licença

MIT
