# /manga — história vira mangá (skill para Claude Code)

Você conta a história, o Claude escreve o roteiro, quebra em páginas e quadros, gera a arte com IA
e monta as páginas em HTML com balões, onomatopeias e um modo animado.

```
história → roteiro (4 páginas) → quadros gerados por IA → balões e montagem → páginas prontas
```

- Balões em HTML: o texto fica limpo e em qualquer idioma, sem as letras tortas que a IA costuma inventar.
- Estilos: shōnen, shōjo, seinen, chibi, terror, webtoon, mangá colorido e comic americano, além de estilos novos.
- 7 layouts de página prontos: clássico, ação, diálogo, clímax, tensão, abertura e página inteira.
- Modo animado (quadro a quadro), formato webtoon (rolagem vertical) e exportação em PDF (Ctrl+P).

---

## ⚠️ VOCÊ PRECISA DAS SUAS PRÓPRIAS CREDENCIAIS

Este repositório **não vem com chave nenhuma**. Cada pessoa configura a própria conta no arquivo
`.env`, e o uso fica na conta de quem configurou. Escolha um dos dois geradores:

|  | **Cloudflare Workers AI** | **Google Gemini** |
|---|---|---|
| Preço | **Grátis** (cota diária, sem cartão) | **Pago** (exige faturamento ativo) |
| Modelo | FLUX.1 schnell | Nano Banana 2 (`gemini-3.1-flash-image`) |
| Qualidade | boa | muito boa |
| Mesmo personagem em todos os quadros | média: só pela descrição em texto | **alta**: usa fichas de personagem como referência visual |
| Formato da imagem | quadrada (o layout recorta) | na proporção certa de cada quadro |

### Opção 1: GRÁTIS (Cloudflare)
1. Crie uma conta grátis em **https://dash.cloudflare.com/sign-up**. Não pede cartão.
2. No painel, abra **Workers AI** e copie o **Account ID**.
3. Ainda em Workers AI, clique em **"Use REST API" → "Create a Workers AI API Token"** e copie o token.
4. Copie `.env.example` para `.env` e preencha:
   ```
   CLOUDFLARE_ACCOUNT_ID=seu_account_id
   CLOUDFLARE_API_TOKEN=seu_token
   ```
A cota gratuita renova todo dia. Se acabar no meio de um mangá, o script avisa, e no dia seguinte
você roda de novo: ele continua de onde parou, porque os quadros já gerados ficam salvos.

### Opção 2: PAGO, melhor qualidade (Gemini)
1. Crie uma chave em **https://aistudio.google.com/apikey**.
2. **Ative o faturamento (billing)** no projeto dessa chave.
   > O plano gratuito do Gemini tem **limite 0 para geração de imagem**. Sem faturamento, todo pedido
   > volta com erro `429 ... free_tier ... limit: 0`, e o script avisa isso e para.
3. No `.env`, coloque:
   ```
   GEMINI_API_KEY=AIza...sua_chave...
   ```
Custo aproximado: alguns centavos de dólar por imagem, o que dá **cerca de US$ 1 por mangá de 4 páginas**.
Os preços oficiais estão em https://ai.google.dev/pricing.

Se o `.env` tiver as duas opções, o Gemini é usado. Para forçar uma delas, use `IMAGE_PROVIDER=cloudflare`
ou passe `--provider cloudflare` no comando.

> 🔒 **Nunca suba o `.env`.** Ele já está no `.gitignore`, então não tire de lá. Também não cole sua chave em chats ou issues.

---

## Instalação

Requisitos: [Claude Code](https://claude.com/claude-code) e Node.js 18 ou mais novo (o projeto não tem dependências npm).

```bash
git clone https://github.com/thiagoalves0707/manga-skill ~/.claude/skills/manga
cd ~/.claude/skills/manga
cp .env.example .env    # depois edite e preencha suas credenciais
```

No Windows (PowerShell):

```powershell
git clone https://github.com/thiagoalves0707/manga-skill "$HOME\.claude\skills\manga"
Copy-Item "$HOME\.claude\skills\manga\.env.example" "$HOME\.claude\skills\manga\.env"
notepad "$HOME\.claude\skills\manga\.env"
```

Teste se as credenciais funcionam (o comando lista os modelos de imagem disponíveis):

```bash
node ~/.claude/skills/manga/scripts/gen.mjs --list-models
```

## Uso

No Claude Code, peça normalmente ou chame a skill:

```
/manga faz um mangá de 4 páginas, estilo shōjo, sobre uma garota que descobre que o gato dela é um deus
```

O Claude escreve o `story.json`, gera os quadros, revisa cada imagem, posiciona os balões e monta o `index.html`.

### Rodando na mão

```bash
node scripts/gen.mjs   <pasta-com-story.json>                 # gera todos os quadros que faltam
node scripts/gen.mjs   <pasta> --only chars                   # fichas de personagem (só no Gemini)
node scripts/gen.mjs   <pasta> --force --only p2c             # refaz só o quadro c da página 2
node scripts/gen.mjs   <pasta> --provider cloudflare          # escolhe o gerador
node scripts/build.mjs <pasta>                                # monta <pasta>/index.html
```

Para ver o resultado, abra `index.html` no navegador. O botão **▶ Animar** liga o modo quadro a quadro.

## Estrutura

```
SKILL.md                     instruções que o Claude segue (roteiro, prompts, letreiramento)
scripts/gen.mjs              gera a arte (Gemini ou Cloudflare)
scripts/build.mjs            story.json + img/ → index.html
assets/layouts.json          layouts de página e proporção de cada quadro
assets/styles.json           prompt de arte de cada estilo (adicione os seus)
assets/manga-template.html   motor de páginas, balões, SFX, temas e animação
examples/ultimo-trem/        roteiro de exemplo de 4 páginas (as imagens não vêm no repo)
```

## Status

O pipeline completo está implementado nos dois geradores. A arte de exemplo ainda não foi gerada nem
publicada aqui. Rode o exemplo com as suas credenciais:

```bash
node scripts/gen.mjs examples/ultimo-trem && node scripts/build.mjs examples/ultimo-trem
```
