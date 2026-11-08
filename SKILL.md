---
name: manga
description: Transforma uma história em mangá de verdade (ex.: 4 páginas) com arte gerada por IA (Gemini) — Claude escreve o roteiro, quebra em páginas e quadros, gera fichas de personagem para consistência, gera cada quadro, e monta as páginas em HTML com balões, onomatopeias e modo animado. Vários estilos (shōnen, shōjo, seinen, chibi, terror, webtoon, mangá colorido, comic) e estilos novos. Use quando o usuário pedir mangá, HQ, quadrinho, gibi, webtoon, tirinha, ou "transformar uma história em quadrinhos".
---

# Mangá com IA (história → páginas prontas)

Divisão de trabalho: **você** é roteirista, diretor de cena e letreirista. O **Gemini** desenha.
O motor HTML monta páginas, balões (texto limpo, em qualquer idioma) e animação.

```
skill/
  scripts/gen.mjs        gera fichas de personagem + cada quadro (Gemini, Node 18+, sem dependências)
  scripts/build.mjs      story.json + img/ → index.html
  assets/layouts.json    layouts de página e proporção de cada quadro
  assets/styles.json     prompt de estilo de arte por estilo
  assets/manga-template.html  motor (balões, SFX, temas, modo animado)
  examples/ultimo-trem/  exemplo completo de 4 páginas
```

## Pré-requisito
`GEMINI_API_KEY` no ambiente ou num `.env` (pasta do projeto, pasta atual ou pasta da skill).
Sem chave: oriente o usuário a criar em https://aistudio.google.com/apikey e salvar no `.env`
ele mesmo. **Nunca peça para colar a chave no chat.**
Modelos de imagem **não têm cota gratuita** (erro 429 "free_tier ... limit: 0"): o projeto da chave
precisa de faturamento ativo no AI Studio. O gen.mjs detecta isso e para com aviso.
Modelo padrão `gemini-3.1-flash-image` (Nano Banana 2). Rode `node gen.mjs --list-models` e, se existir um modelo de
imagem melhor (ex.: `*-pro-image*`), use `--model` ou `"model"` no story.json.

## Workflow
1. **Briefing** (pergunte só o que faltar): história, nº de páginas (padrão 4), estilo, formato
   (`pages`/`webtoon`), idioma dos balões, se o usuário tem imagens de referência dos personagens.
2. **Roteiro** — estrutura de 4 páginas que funciona:
   p1 ambientação + apresentação · p2 incidente/ação · p3 diálogo/tensão · p4 virada/clímax (splash ou `climax`).
   Termine com gancho. Cada página: escolha um layout em `layouts.json` pelo ritmo (campo `uso`).
3. **Escrever `story.json`** numa pasta própria do projeto (ver esquema abaixo e `examples/ultimo-trem`).
4. **Fichas primeiro:** `node <skill>/scripts/gen.mjs <pasta> --only chars`. Abra cada ficha (Read na
   imagem). Se o visual não bater com a descrição, ajuste `look` e regenere (`--force --only chars`).
   As fichas são a âncora de consistência; não siga com ficha ruim.
5. **Quadros:** `node <skill>/scripts/gen.mjs <pasta>` (rodar em background; ~10–30 s por quadro).
6. **Revisar cada imagem** (Read). Regenerar as ruins com `--force --only p2c`, reescrevendo o prompt
   (mais específico, menos coisas na cena). Problemas comuns: texto/letras na imagem, personagem
   diferente da ficha, mãos estranhas, composição sem espaço para balão.
7. **Letreiramento:** com as imagens à vista, posicione balões e SFX (`x`,`y` = centro em %) sobre
   espaço vazio, nunca sobre rostos; rabicho (`tip`) apontando para a boca de quem fala.
   Ordem de leitura dos balões = ordem no array. Ajuste `pos` (ex.: `"center top"`) se o corte esconder algo.
8. **Montar:** `node <skill>/scripts/build.mjs <pasta>` → `<pasta>/index.html`. Abrir num servidor
   estático + Browser pane, conferir cada página (screenshot) e o modo ▶ Animar.
9. **Entregar:** pasta com `index.html` + `img/`. Para link compartilhável, publicar como Artifact
   (carregue `artifact-design` antes; envie as imagens em `files`). PDF: Ctrl+P.

## Esquema do `story.json`
```jsonc
{
  "title": "...", "author": "...", "chapter": "...",
  "style": "shonen",            // chave de assets/styles.json (prompt de arte)
  "styleGuide": "...",          // opcional: detalhes extras de estilo para TODOS os quadros
  "theme": "shonen",            // opcional: tema visual da página (shonen|shojo|seinen|chibi|webtoon|comic)
  "format": "pages",            // ou "webtoon"
  "model": "gemini-3.1-flash-image",
  "setting": "época/lugar geral",
  "characters": [{ "id": "kaito", "name": "Kaito", "look": "descrição visual fixa e detalhada (idade, cabelo, olhos, roupa, marcas)", "ref": "opcional/imagem-do-usuario.png" }],
  "pages": [{
    "layout": "classico4",       // ou "grid": {areas, cols, rows} customizado (aí informe "aspect" nos quadros)
    "setting": "opcional, cenário da página",
    "panels": [{
      "area": "a",
      "prompt": "o que acontece no quadro, em inglês, concreto e visual",
      "shot": "enquadramento: wide / medium / close-up / extreme close-up, ângulo",
      "chars": ["kaito"],        // personagens no quadro → fichas enviadas como referência
      "space": "top left",       // onde deixar espaço para balão
      "aspect": "16:9",          // opcional, sobrescreve o layout (1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 21:9)
      "refs": ["opcional.png"], "img": "opcional: imagem pronta, pula a geração",
      "pos": "center top", "fx": "shake | flash",
      "bubbles": [{ "type": "speech|thought|shout|whisper|narration", "text": "...", "x": 50, "y": 15, "w": 40, "tip": [20, 130] }],
      "sfx": [{ "text": "DOOM", "x": 70, "y": 60, "size": "10cqw", "rot": -10 }]
    }]
  }]
}
```

## Escrevendo bons prompts de quadro
- **Em inglês**, uma ação por quadro, sujeito + ação + expressão + ambiente + luz. Ex.:
  "Kaito diving through closing train doors, scarf whipping, gritted teeth, harsh fluorescent light".
- Sempre `shot` (o enquadramento faz o quadro parecer mangá): varie wide/medium/close dentro da página.
- Repita o detalhe que identifica o personagem quando ele aparece pequeno (ex.: "red scarf").
- O script já proíbe texto/balões/molduras na imagem — os balões são HTML.
- Máx. 2–3 personagens por quadro; mais que isso a consistência cai.

## Estilos
`style` escolhe o prompt de arte (`assets/styles.json`); `theme` escolhe o visual da página/balões.

| style | arte | tema sugerido |
|---|---|---|
| shonen | nanquim forte, retícula, linhas de velocidade | shonen |
| shojo | traço fino, olhos brilhantes, flores e brilhos | shojo |
| seinen | realista, pretos pesados, hachura | seinen |
| chibi | super-deformado, comédia | chibi |
| horror | traço inquietante, sombras | seinen |
| webtoon | colorido digital, cel shading | webtoon (+ `format:"webtoon"`) |
| manga-color | página colorida de revista | comic |
| comic | HQ americana, cores chapadas | comic |

**Estilo novo:** adicione uma chave em `styles.json` com um prompt de arte descritivo (traço,
sombreamento, cor, clima; descreva características, não copie obra/artista específico) e, se quiser,
um tema novo no topo do `manga-template.html` (bloco `[data-style="..."]` com as CSS variables + `<option>`).
Para estilo pontual de uma história só, use `styleGuide` no story.json.

## Linguagem de mangá
- Leitura esquerda→direita para público BR (padrão); a ordem dos quadros no array é a ordem de leitura e da animação.
- Abrir cena com plano geral; emoção em close; clímax no maior quadro. Quadro largo = pausa/tempo; quadros pequenos em sequência = ação rápida.
- ≤ ~20 palavras por balão, `<br>` para quebrar. SFX grandes e inclinados perto da fonte do som.
- Modo animado: quadros entram em ordem, imagem com zoom lento, balões na ordem de leitura. `fx: "shake"`/`"flash"` só em impacto real.
