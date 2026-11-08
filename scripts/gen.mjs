#!/usr/bin/env node
/* Gera a arte do mangá com o Gemini (fichas de personagem + cada quadro).
   Uso:
     node gen.mjs <pasta>                 gera tudo que ainda não existe
     node gen.mjs <pasta> --only chars    só fichas de personagem
     node gen.mjs <pasta> --only p2       só a página 2   (p1-3 = páginas 1 a 3, p2c = quadro c da p2)
     node gen.mjs <pasta> --force         regenera mesmo se já existir (combine com --only)
     node gen.mjs --list-models           lista modelos de imagem disponíveis para a chave
   Opções: --model <id>  --concurrency <n>
   Chave: GEMINI_API_KEY no ambiente, ou num .env na pasta do projeto, na pasta atual ou na pasta da skill. */
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--force', '--list-models'].includes(argv[i - 1])));
const dir = path.resolve(pos[0] || '.');

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const f of [path.join(dir, '.env'), path.join(process.cwd(), '.env'), path.join(SKILL, '.env')]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/^\s*(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*["']?([^"'\r\n]+)/m);
    if (m) return m[1].trim();
  }
  console.error('ERRO: GEMINI_API_KEY não encontrada (ambiente ou .env). Pegue em https://aistudio.google.com/apikey');
  process.exit(2);
}
const KEY = loadKey();
if (/cole_sua|sua_chave/i.test(KEY)) {
  console.error('ERRO: o .env ainda tem o texto de exemplo. Troque pelo valor da SUA chave do Gemini (https://aistudio.google.com/apikey).');
  process.exit(2);
}
const API = 'https://generativelanguage.googleapis.com/v1beta';

if (opt('list-models')) {
  const r = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': KEY } });
  const j = await r.json();
  if (!r.ok) { console.error(JSON.stringify(j, null, 2)); process.exit(1); }
  for (const m of j.models || []) if (/image/i.test(m.name)) console.log(m.name.replace('models/', ''), '—', m.displayName);
  process.exit(0);
}

const story = JSON.parse(await fs.readFile(path.join(dir, 'story.json'), 'utf8'));
const layouts = JSON.parse(await fs.readFile(path.join(SKILL, 'assets', 'layouts.json'), 'utf8'));
const styles = JSON.parse(await fs.readFile(path.join(SKILL, 'assets', 'styles.json'), 'utf8'));
const MODEL = opt('model') || process.env.GEMINI_IMAGE_MODEL || story.model || 'gemini-3.1-flash-image';
const FORCE = !!opt('force');
const ONLY = opt('only');
const CONC = +opt('concurrency', 3);
const imgDir = path.join(dir, 'img');
await fs.mkdir(imgDir, { recursive: true });
const manifestPath = path.join(imgDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : {};
const saveManifest = () => fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const stylePrompt = [styles[story.style] || '', story.styleGuide || ''].filter(Boolean).join('. ');
const NO_TEXT = 'Absolutely NO text, NO letters, NO speech bubbles, NO sound-effect lettering, NO captions, NO signature, NO watermark, NO panel borders or frames.';

function wanted(key) { // key: chars | p1a
  if (!ONLY || ONLY === true) return true;
  if (ONLY === 'chars') return key.startsWith('char-');
  if (key.startsWith('char-')) return false;
  const m = String(ONLY).match(/^p(\d+)(?:-(\d+))?([a-z])?$/); if (!m) return false;
  const k = key.match(/^p(\d+)([a-z])$/); const pg = +k[1];
  const lo = +m[1], hi = m[2] ? +m[2] : lo;
  return pg >= lo && pg <= hi && (!m[3] || m[3] === k[2]);
}

async function mimeOf(file) { return /\.jpe?g$/i.test(file) ? 'image/jpeg' : /\.webp$/i.test(file) ? 'image/webp' : 'image/png'; }
async function inline(file) { return { inline_data: { mime_type: await mimeOf(file), data: (await fs.readFile(file)).toString('base64') } }; }

async function generate(parts, aspect, label) {
  const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } };
  for (let attempt = 1; attempt <= 4; attempt++) {
    let r, j;
    try {
      r = await fetch(`${API}/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      j = await r.json();
    } catch (e) { j = { error: { message: String(e) } }; }
    if (r?.ok) {
      const p = j.candidates?.[0]?.content?.parts?.find(x => x.inlineData || x.inline_data);
      if (p) { const d = p.inlineData || p.inline_data; return { buf: Buffer.from(d.data, 'base64'), mime: d.mimeType || d.mime_type || 'image/png' }; }
      const why = j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || 'sem imagem';
      const txt = j.candidates?.[0]?.content?.parts?.map(x => x.text).filter(Boolean).join(' ');
      console.warn(`  [${label}] tentativa ${attempt}: ${why}${txt ? ' — ' + txt.slice(0, 200) : ''}`);
    } else {
      console.warn(`  [${label}] tentativa ${attempt}: HTTP ${r?.status} ${j?.error?.message?.slice(0, 300) || ''}`);
      if (r && [400, 401, 403, 404].includes(r.status)) throw new Error(j?.error?.message || 'erro da API');
      if (r?.status === 429 && /free_tier[^\n]*limit: 0/.test(j?.error?.message || '')) {
        console.error(`\nERRO: o plano gratuito da chave não permite gerar imagem com ${MODEL} (limite 0).` +
          `\nAtive o faturamento (billing) no projeto da chave: https://aistudio.google.com/apikey → "Set up billing".`);
        process.exit(3);
      }
    }
    await new Promise(res => setTimeout(res, 2000 * attempt * attempt));
  }
  throw new Error('falhou após 4 tentativas');
}

async function save(key, out) {
  const ext = out.mime.includes('jpeg') ? 'jpg' : out.mime.includes('webp') ? 'webp' : 'png';
  const file = `${key}.${ext}`;
  await fs.writeFile(path.join(imgDir, file), out.buf);
  manifest[key] = file; await saveManifest();
  console.log(`  ✓ ${file}`);
}
const have = key => manifest[key] && existsSync(path.join(imgDir, manifest[key]));

// 1) Fichas de personagem (referência de consistência)
const chars = Object.fromEntries((story.characters || []).map(c => [c.id, c]));
const charRef = id => { const c = chars[id]; if (!c) return null;
  if (c.ref) return path.resolve(dir, c.ref);
  return have('char-' + id) ? path.join(imgDir, manifest['char-' + id]) : null; };

const charJobs = (story.characters || []).filter(c => !c.ref && wanted('char-' + c.id) && (FORCE || !have('char-' + c.id))).map(c => async () => {
  console.log(`personagem ${c.id}…`);
  const prompt = `Character reference sheet for a manga. ${stylePrompt}. Character: ${c.name} — ${c.look}. ` +
    `Show the same character twice side by side: full body front view and a 3/4 view, plus a large head close-up with a neutral expression. Plain white background. Consistent design. ${NO_TEXT}`;
  await save('char-' + c.id, await generate([{ text: prompt }], c.aspect || '3:2', 'char-' + c.id));
});

// 2) Quadros
const panelJobs = [];
story.pages.forEach((pg, pi) => {
  const L = layouts[pg.layout] || {};
  for (const p of pg.panels) {
    const key = `p${pi + 1}${p.area}`;
    if (!wanted(key) || (!FORCE && have(key)) || p.img) continue;
    panelJobs.push(async () => {
      const aspect = p.aspect || L.slots?.[p.area] || '1:1';
      console.log(`quadro ${key} (${aspect})…`);
      const parts = [];
      const ids = p.chars || [];
      let refNote = '';
      for (const [i, id] of ids.entries()) {
        const f = charRef(id); if (!f) continue;
        parts.push({ text: `Reference image ${i + 1}: character sheet of ${chars[id].name}.` }, await inline(f));
        refNote += ` ${chars[id].name} must look exactly like reference image ${i + 1} (same face, hairstyle, outfit, proportions): ${chars[id].look}.`;
      }
      for (const r of p.refs || []) parts.push({ text: 'Additional visual reference:' }, await inline(path.resolve(dir, r)));
      const text = [
        `A single manga panel illustration. Style: ${stylePrompt}.`,
        pg.setting || story.setting ? `Setting: ${p.setting || pg.setting || story.setting}.` : '',
        `Scene: ${p.prompt}`,
        p.shot ? `Camera: ${p.shot}.` : '',
        refNote ? `Characters:${refNote}` : '',
        p.space ? `Keep a clean, uncluttered area at the ${p.space} of the image for speech balloons to be added later.` : '',
        `The artwork fills the entire canvas edge to edge. ${NO_TEXT}`,
      ].filter(Boolean).join('\n');
      parts.push({ text });
      await save(key, await generate(parts, aspect, key));
    });
  }
});

async function pool(jobs, n) {
  const errs = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) { const j = jobs[i++]; try { await j(); } catch (e) { errs.push(e.message); console.error('  ✗', e.message); } } }));
  return errs;
}
console.log(`modelo: ${MODEL} · ${charJobs.length} ficha(s) · ${panelJobs.length} quadro(s)`);
const e1 = await pool(charJobs, CONC);   // fichas primeiro: os quadros dependem delas
const e2 = await pool(panelJobs, CONC);
const errs = [...e1, ...e2];
console.log(errs.length ? `terminou com ${errs.length} erro(s)` : 'pronto.');
process.exit(errs.length ? 1 : 0);
