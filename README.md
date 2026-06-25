# 🐱 Pet Gato Motivador

Um gato virtual que vive na tua área de trabalho, motiva-te e ajuda com comandos úteis.

## Instalação

```bash
npm install
npm start
```

## Comandos disponíveis

| Comando | Descrição |
|---------|-----------|
| `ajuda` | Mostra todos os comandos |
| `pergunta [questão]` | Pergunta à IA (requer API key Anthropic) |
| `ia [questão]` | Alias para pergunta |
| `tempo` | Tempo em Lisboa (Open-Meteo) |
| `bolsa` | Mercados financeiros (Binance, Frankfurter, Stooq) |
| `noticias` | Notícias portuguesas (RSS) |
| `abrir google` | Abre o Google |
| `abrir youtube` | Abre o YouTube |
| `abrir gmail` | Abre o Gmail |
| `abrir github` | Abre o GitHub |
| `abrir drive` | Abre o Google Drive |
| `abrir calculadora` | Abre a Calculadora |
| `abrir cmd` | Abre o Prompt de Comando |
| `abrir definicoes` | Abre as Definições do Windows |
| `abrir bluetooth` | Abre as definições Bluetooth |
| `abrir explorador` | Abre o Explorador de Ficheiros |
| `marcar evento [título] [DD/MM] [HH:MM]` | Abre Google Calendar com evento preenchido |
| `fechar [app]` | Fecha chrome, edge, firefox, spotify, discord, vscode... |
| `fechar tudo` | Fecha todas as aplicações abertas |
| `fechar aplicativo` | Fecha o app aberto mais recentemente |
| `dizer [texto]` | O gato diz o texto |
| `ia key` | Apaga a API key guardada |

## Atalhos de teclado

- `Ctrl+Shift+P` — Mostrar/esconder o pet
- `Ctrl+Shift+M` — Alternar modo mouse

## IA (Claude)

Para usar a IA, precisas de uma API key da Anthropic:
1. Vai a console.anthropic.com
2. Cria uma conta gratuita
3. Gera uma API key (sk-ant-...)
4. Escreve `pergunta olá` — o pet pede a key na primeira vez

## Autor

Tiago Araújo — 2024
