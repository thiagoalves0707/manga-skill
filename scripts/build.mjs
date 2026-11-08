#!/usr/bin/env node
/* Monta <pasta>/index.html a partir de <pasta>/story.json + imagens em <pasta>/img.
   Uso: node build.mjs <pasta> */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.resolve(process.argv[2] || '.');
const story = JSON.parse(await fs.readFile(path.join(dir, 'story.json'), 'utf8'));
const layouts = JSON.parse(await fs.readFile(path.join(SKILL, 'assets', 'layouts.json'), 'utf8'));
const mf = path.join(dir, 'img', 'manifest.json');
const manifest = existsSync(mf) ? JSON.parse(await fs.readFile(mf, 'utf8')) : {};
const missing = [];

const out = {
  title: story.title, author: story.author || '', chapter: story.chapter || '',
  style: story.theme || (story.style in { shojo: 1, seinen: 1, chibi: 1, webtoon: 1, comic: 1 } ? story.style : story.style === 'horror' ? 'seinen' : story.style === 'manga-color' ? 'comic' : 'shonen'),
  format: story.format || 'pages', motion: !!story.motion,
  pages: story.pages.map((pg, pi) => {
    const L = layouts[pg.layout];
    if (!L && !pg.grid) throw new Error(`página ${pi + 1}: layout "${pg.layout}" não existe`);
    return {
      grid: pg.grid || { areas: L.areas, cols: L.cols, rows: L.rows },
      panels: pg.panels.map(p => {
        const key = `p${pi + 1}${p.area}`;
        const img = p.img || (manifest[key] ? `img/${manifest[key]}` : null);
        if (!img) missing.push(key);
        const [w, h] = (p.aspect || L?.slots?.[p.area] || '1:1').split(':').map(Number);
        return { area: p.area, img, pos: p.pos, fx: p.fx, ratio: `${w}/${h}`, bubbles: p.bubbles || [], sfx: p.sfx || [] };
      }),
    };
  }),
};

let html = await fs.readFile(path.join(SKILL, 'assets', 'manga-template.html'), 'utf8');
html = html.replace(/\/\*STORY:BEGIN\*\/[\s\S]*?\/\*STORY:END\*\//, `/*STORY:BEGIN*/\nconst STORY = ${JSON.stringify(out, null, 1)};\n/*STORY:END*/`);
await fs.writeFile(path.join(dir, 'index.html'), html);
console.log(`ok → ${path.join(dir, 'index.html')}`);
if (missing.length) console.log(`atenção: sem imagem ainda: ${missing.join(', ')}`);
