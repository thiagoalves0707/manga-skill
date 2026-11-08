# /manga — história vira mangá (skill para Claude Code)

Você conta a história, o Claude escreve o roteiro, quebra em páginas e quadros, gera a arte com o
**Gemini (Nano Banana)** e monta as páginas em HTML com balões, onomatopeias e um modo animado.

```
história → roteiro (4 páginas) → fichas de personagem → quadros gerados por IA → páginas montadas
```

- Personagens consistentes: primeiro é gerada uma ficha de cada personagem, e ela vai como referência em todo quadro.
- Balões em HTML: o texto fica limpo e em qualquer idioma, sem as letras tortas que a IA costuma inventar.
- Estilos: shōnen, shōjo, seinen, chibi, terror, webtoon, mangá colorido e comic americano, além de estilos novos.
- 7 layouts de página prontos: clássico, ação, diálogo, clímax, tensão, abertura e página inteira.
- Modo animado (quadro a quadro), formato webtoon (rolagem vertical) e exportação em PDF (Ctrl+P).

---

## ⚠️ VOCÊ PRECISA DA SUA PRÓPRIA CHAVE DO GEMINI

Este repositório **não vem com chave nenhuma**. Cada pessoa usa a própria chave, e quem paga as imagens é o dono da chave.

1. Crie uma chave em **https://aistudio.google.com/apikey**.
2. **Ative o faturamento (billing)** no projeto dessa chave: no AI Studio, clique em "Set up billing".
   > O plano gratuito do Gemini tem **limite 0 para geração de imagem**. Sem faturamento, todo pedido
   > volta com erro `429 ... free_tier ... limit: 0`, e o script avisa isso e para.
3. Copie `.env.example` para `.env` e cole a sua chave:
   ```
   GEMINI_API_KEY=AIza...sua_chave...
   ```
4. **Nunca suba o `.env`.** Ele já está no `.gitignore`, então não tire de lá.

**Custo aproximado:** com o `gemini-3.1-flash-image` (Nano Banana 2), cada imagem sai por alguns
centavos de dólar. Um mangá de 4 páginas tem umas 12 a 16 imagens, o que dá por volta de US$ 1. Os preços
oficiais estão em https://ai.google.dev/pricing. Se quiser, configure um limite de gasto no Google Cloud.

---

## Instalação

Requisitos: [Claude Code](https://claude.com/claude-code) e Node.js 18 ou mais novo (o projeto não tem dependências npm).

```bash
git clone https://github.com/thiagoalves0707/manga-skill ~/.claude/skills/manga
cd ~/.claude/skills/manga
cp .env.example .env    # depois edite e cole sua chave
```

No Windows (PowerShell):

```powershell
git clone https://github.com/thiagoalves0707/manga-skill "$HOME\.claude\skills\manga"
Copy-Item "$HOME\.claude\skills\manga\.env.example" "$HOME\.claude\skills\manga\.env"
notepad "$HOME\.claude\skills\manga\.env"
```

Teste se a chave funciona:

```bash
node ~/.claude/skills/manga/scripts/gen.mjs --list-models
```

## Uso

No Claude Code, peça normalmente ou chame a skill:

```
/manga faz um mangá de 4 páginas, estilo shōjo, sobre uma garota que descobre que o gato dela é um deus
```

O Claude escreve o `story.json`, gera as fichas, confere, gera os quadros, revisa, posiciona os balões e monta o `index.html`.

### Rodando na mão

```bash
node scripts/gen.mjs   <pasta-com-story.json> --only chars   # fichas de personagem
node scripts/gen.mjs   <pasta-com-story.json>                 # todos os quadros que faltam
node scripts/gen.mjs   <pasta> --force --only p2c             # refaz só o quadro c da página 2
node scripts/build.mjs <pasta>                                # monta <pasta>/index.html
```

Para ver o resultado, abra `index.html` no navegador. O botão **▶ Animar** liga o modo quadro a quadro.

## Estrutura

```
SKILL.md                     instruções que o Claude segue (roteiro, prompts, letreiramento)
scripts/gen.mjs              gera fichas e quadros via API do Gemini
scripts/build.mjs            story.json + img/ → index.html
assets/layouts.json          layouts de página e proporção de cada quadro
assets/styles.json           prompt de arte de cada estilo (adicione os seus)
assets/manga-template.html   motor de páginas, balões, SFX, temas e animação
examples/ultimo-trem/        roteiro de exemplo de 4 páginas (as imagens não vêm no repo)
```

## Status

O pipeline completo está implementado. A arte de exemplo ainda não foi gerada, porque precisa de uma
chave com faturamento ativo. Rode o exemplo com a sua chave:

```bash
node scripts/gen.mjs examples/ultimo-trem && node scripts/build.mjs examples/ultimo-trem
```
