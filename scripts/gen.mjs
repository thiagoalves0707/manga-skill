#!/usr/bin/env node
/* Gera a arte do mangá (fichas de personagem + cada quadro).
   Geradores:
     gemini      — Google Gemini (Nano Banana). Melhor qualidade e personagens consistentes (usa fichas
                   como referência). PAGO: exige faturamento ativo na chave.
     cloudflare  — Cloudflare Workers AI (FLUX.1 schnell). GRÁTIS com cota diária, sem cartão.
                   Não aceita imagem de referência: a consistência vem só da descrição do personagem.
   Uso:
     node gen.mjs <pasta>                 gera tudo que ainda não existe
     node gen.mjs <pasta> --only chars    só fichas de personagem (só no gemini)
     node gen.mjs <pasta> --only p2       só a página 2   (p1-3 = páginas 1 a 3, p2c = quadro c da p2)
     node gen.mjs <pasta> --force         regenera mesmo se já existir (combine com --only)
     node gen.mjs --list-models           lista modelos de imagem disponíveis
   Opções: --provider gemini|cloudflare  --model <id>  --concurrency <n>
   Credenciais (ambiente ou .env na pasta do projeto, na pasta atual ou na pasta da skill):
     GEMINI_API_KEY                                   → gemini
     CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN     → cloudflare
     IMAGE_PROVIDER=gemini|cloudflare                 → força um deles (senão: gemini se houver chave, depois cloudflare) */
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const FLAGS = ['--force', '--list-models'];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !FLAGS.includes(argv[i - 1])));
const dir = path.resolve(pos[0] || '.');
const die = (msg, code = 2) => { if (process.exitCode == null) console.error('\nERRO: ' + msg); process.exitCode ??= code; throw new Error('__exit__'); };
process.on('uncaughtException', e => { if (e.message !== '__exit__') { console.error(e); process.exitCode = 1; } });

// ---------- credenciais ----------
function loadEnv() {
  const env = {};
  for (const f of [path.join(dir, '.env'), path.join(process.cwd(), '.env'), path.join(SKILL, '.env')]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?([^"'\r\n#]*)/);
      if (m && m[2].trim() && !(m[1] in env)) env[m[1]] = m[2].trim();
    }
  }
  for (const k of Object.keys(process.env)) if (/^(GEMINI|GOOGLE|CLOUDFLARE|CF_|IMAGE_)/.test(k) && process.env[k]) env[k] = process.env[k].trim();
  if (!env.GEMINI_API_KEY && env.GOOGLE_API_KEY) env.GEMINI_API_KEY = env.GOOGLE_API_KEY;
  for (const k of Object.keys(env)) if (/cole_sua|sua_chave|seu_token|seu_account/i.test(env[k])) delete env[k]; // texto de exemplo do .env.example
  return env;
}
const ENV = loadEnv();
const PROVIDER = String(opt('provider') || ENV.IMAGE_PROVIDER || (ENV.GEMINI_API_KEY ? 'gemini' : ENV.CLOUDFLARE_API_TOKEN ? 'cloudflare' : '')).toLowerCase();
if (!PROVIDER) die('nenhuma credencial encontrada. Configure o .env (veja .env.example):\n' +
  '  • GRÁTIS: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN  (https://dash.cloudflare.com → AI → Workers AI)\n' +
  '  • PAGO, melhor qualidade: GEMINI_API_KEY  (https://aistudio.google.com/apikey + faturamento ativo)');

// ---------- geradores ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

const gemini = {
  name: 'gemini', refs: true, aspects: true,
  init() {
    if (!ENV.GEMINI_API_KEY) die('GEMINI_API_KEY não encontrada (ou ainda é o texto de exemplo). Crie em https://aistudio.google.com/apikey');
    this.key = ENV.GEMINI_API_KEY; this.api = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = opt('model') || ENV.GEMINI_IMAGE_MODEL || story?.model || 'gemini-3.1-flash-image';
  },
  async list() {
    const r = await fetch(`${this.api}/models?pageSize=1000`, { headers: { 'x-goog-api-key': this.key } }); const j = await r.json();
    if (!r.ok) die(j.error?.message || 'erro');
    for (const m of j.models || []) if (/image/i.test(m.name)) console.log(m.name.replace('models/', ''), '—', m.displayName);
  },
  async generate({ text, images, aspect, label }) {
    const parts = [];
    for (const im of images) parts.push({ text: im.label }, { inline_data: { mime_type: mimeOf(im.file), data: (await fs.readFile(im.file)).toString('base64') } });
    parts.push({ text });
    const body = { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } };
    for (let attempt = 1; attempt <= 4; attempt++) {
      let r, j;
      try { r = await fetch(`${this.api}/models/${this.model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': this.key, 'content-type': 'application/json' }, body: JSON.stringify(body) }); j = await r.json(); }
      catch (e) { j = { error: { message: String(e) } }; }
      if (r?.ok) {
        const p = j.candidates?.[0]?.content?.parts?.find(x => x.inlineData || x.inline_data);
        if (p) { const d = p.inlineData || p.inline_data; return { buf: Buffer.from(d.data, 'base64'), mime: d.mimeType || d.mime_type || 'image/png' }; }
        const why = j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || 'sem imagem';
        console.warn(`  [${label}] tentativa ${attempt}: ${why}`);
      } else {
        const msg = j?.error?.message || '';
        if (r?.status === 429 && /free_tier[^\n]*limit: 0/.test(msg))
          die(`o plano gratuito do Gemini não permite gerar imagem (limite 0).\n` +
              `Ative o faturamento em https://aistudio.google.com/apikey → "Set up billing",\n` +
              `ou use o gerador GRÁTIS: --provider cloudflare (veja .env.example).`, 3);
        console.warn(`  [${label}] tentativa ${attempt}: HTTP ${r?.status} ${msg.slice(0, 300)}`);
        if (r && [400, 401, 403, 404].includes(r.status)) throw new Error(msg || 'erro da API');
      }
      await sleep(2000 * attempt * attempt);
    }
    throw new Error('falhou após 4 tentativas');
  },
};

const cloudflare = {
  name: 'cloudflare', refs: false, aspects: false,
  init() {
    if (!ENV.CLOUDFLARE_ACCOUNT_ID || !ENV.CLOUDFLARE_API_TOKEN)
      die('faltam CLOUDFLARE_ACCOUNT_ID e/ou CLOUDFLARE_API_TOKEN no .env (veja .env.example).');
    this.api = `https://api.cloudflare.com/client/v4/accounts/${ENV.CLOUDFLARE_ACCOUNT_ID}/ai`;
    this.model = opt('model') || ENV.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
    this.aspects = !/flux-1-schnell/.test(this.model); // schnell só faz quadrado; o build recorta (object-fit: cover)
  },
  headers() { return { authorization: `Bearer ${ENV.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }; },
  async list() {
    const r = await fetch(`${this.api}/models/search?task=Text-to-Image&per_page=100`, { headers: this.headers() }); const j = await r.json();
    if (!j.success) die(JSON.stringify(j.errors));
    for (const m of j.result || []) console.log(m.name, '—', (m.description || '').slice(0, 90));
  },
  async generate({ text, aspect, label }) {
    const body = { prompt: text.slice(0, 2048), steps: /schnell/.test(this.model) ? 8 : undefined };
    if (this.aspects) { const [w, h] = aspect.split(':').map(Number), k = Math.sqrt(w / h);
      body.width = Math.round(1024 * k / 16) * 16; body.height = Math.round(1024 / k / 16) * 16; }
    for (let attempt = 1; attempt <= 4; attempt++) {
      let r, j = {};
      try {
        r = await fetch(`${this.api}/run/${this.model}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.startsWith('image/')) return { buf: Buffer.from(await r.arrayBuffer()), mime: ct };
        j = await r.json();
      } catch (e) { j = { errors: [{ message: String(e) }] }; }
      if (r?.ok && j.result?.image) return { buf: Buffer.from(j.result.image, 'base64'), mime: 'image/jpeg' };
      const msg = (j.errors || []).map(e => `${e.code || ''} ${e.message}`).join('; ') || `HTTP ${r?.status}`;
      if (/4006|daily free allocation|neurons/i.test(msg)) die('acabou a cota GRÁTIS diária da Cloudflare. Ela renova todo dia (00:00 UTC) — rode de novo amanhã; o que já foi gerado fica salvo.', 3);
      if (/7003|10000|10001|Authentication|Unauthorized/i.test(msg) || [401, 403].includes(r?.status))
        die(`a Cloudflare recusou as credenciais (${msg.slice(0, 160)}).\nConfira CLOUDFLARE_ACCOUNT_ID (o ID da conta, 32 caracteres) e se o token tem permissão "Workers AI".`);
      if (r && [400, 404].includes(r.status)) throw new Error(msg);
      console.warn(`  [${label}] tentativa ${attempt}: ${msg.slice(0, 300)}`);
      await sleep(2000 * attempt * attempt);
    }
    throw new Error('falhou após 4 tentativas');
  },
};

const PROVIDERS = { gemini, cloudflare };
const G = PROVIDERS[PROVIDER] || die(`gerador desconhecido "${PROVIDER}" (use gemini ou cloudflare)`);
const storyPath = path.join(dir, 'story.json');
var story = existsSync(storyPath) ? JSON.parse(await fs.readFile(storyPath, 'utf8')) : null;
G.init();

if (opt('list-models')) { await G.list(); }
else {
  if (!story) die(`não achei ${storyPath}`);
  await run();
}

// ---------- geração ----------
function mimeOf(file) { return /\.jpe?g$/i.test(file) ? 'image/jpeg' : /\.webp$/i.test(file) ? 'image/webp' : 'image/png'; }

async function run() {
  const layouts = JSON.parse(await fs.readFile(path.join(SKILL, 'assets', 'layouts.json'), 'utf8'));
  const styles = JSON.parse(await fs.readFile(path.join(SKILL, 'assets', 'styles.json'), 'utf8'));
  const FORCE = !!opt('force'), ONLY = opt('only'), CONC = +opt('concurrency', G.name === 'cloudflare' ? 2 : 3);
  const imgDir = path.join(dir, 'img');
  await fs.mkdir(imgDir, { recursive: true });
  const manifestPath = path.join(imgDir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : {};
  const have = key => manifest[key] && existsSync(path.join(imgDir, manifest[key]));
  const stylePrompt = [styles[story.style] || '', story.styleGuide || ''].filter(Boolean).join('. ');
  const NO_TEXT = 'Absolutely NO text, NO letters, NO speech bubbles, NO sound-effect lettering, NO captions, NO signature, NO watermark, NO panel borders or frames.';

  const wanted = key => {
    if (!ONLY || ONLY === true) return true;
    if (ONLY === 'chars') return key.startsWith('char-');
    if (key.startsWith('char-')) return false;
    const m = String(ONLY).match(/^p(\d+)(?:-(\d+))?([a-z])?$/); if (!m) return false;
    const k = key.match(/^p(\d+)([a-z])$/), pg = +k[1], lo = +m[1], hi = m[2] ? +m[2] : lo;
    return pg >= lo && pg <= hi && (!m[3] || m[3] === k[2]);
  };
  async function save(key, out) {
    const ext = out.mime.includes('jpeg') ? 'jpg' : out.mime.includes('webp') ? 'webp' : 'png', file = `${key}.${ext}`;
    await fs.writeFile(path.join(imgDir, file), out.buf);
    manifest[key] = file; await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ ${file}`);
  }

  // 1) Fichas de personagem — só fazem sentido se o gerador aceita imagem de referência
  const chars = Object.fromEntries((story.characters || []).map(c => [c.id, c]));
  const charRef = id => { const c = chars[id]; if (!c) return null; if (c.ref) return path.resolve(dir, c.ref);
    return have('char-' + id) ? path.join(imgDir, manifest['char-' + id]) : null; };
  const charJobs = !G.refs ? [] : (story.characters || []).filter(c => !c.ref && wanted('char-' + c.id) && (FORCE || !have('char-' + c.id))).map(c => async () => {
    console.log(`personagem ${c.id}…`);
    const text = `Character reference sheet for a manga. ${stylePrompt}. Character: ${c.name} — ${c.look}. ` +
      `Show the same character twice side by side: full body front view and a 3/4 view, plus a large head close-up with a neutral expression. Plain white background. Consistent design. ${NO_TEXT}`;
    await save('char-' + c.id, await G.generate({ text, images: [], aspect: c.aspect || '3:2', label: 'char-' + c.id }));
  });
  if (!G.refs && ONLY === 'chars') console.log(`(${G.name} não usa fichas de referência — pulando; a consistência vem do "look" de cada personagem)`);

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
        const images = []; let who = '';
        for (const id of p.chars || []) {
          const c = chars[id]; if (!c) continue;
          const f = G.refs ? charRef(id) : null;
          if (f) { images.push({ file: f, label: `Reference image ${images.length + 1}: character sheet of ${c.name}.` });
            who += ` ${c.name} must look exactly like reference image ${images.length} (same face, hairstyle, outfit): ${c.look}.`; }
          else who += ` ${c.name}: ${c.look}.`;
        }
        if (G.refs) for (const r of p.refs || []) images.push({ file: path.resolve(dir, r), label: 'Additional visual reference:' });
        const text = [
          G.refs ? `A single manga panel illustration. Style: ${stylePrompt}.` : `Manga panel, ${stylePrompt}.`,
          `Scene: ${p.prompt}`,
          p.shot ? `Camera: ${p.shot}.` : '',
          who ? `Characters:${who}` : '',
          (p.setting || pg.setting || story.setting) ? `Setting: ${p.setting || pg.setting || story.setting}.` : '',
          !G.aspects && aspect !== '1:1' ? `Composition: keep all important elements in the central area (image will be cropped to ${aspect}).` : '',
          p.space ? `Leave a clean empty area at the ${p.space} for speech balloons.` : '',
          `Artwork fills the whole canvas. ${NO_TEXT}`,
        ].filter(Boolean).join('\n');
        await save(key, await G.generate({ text, images, aspect, label: key }));
      });
    }
  });

  async function pool(jobs, n) {
    const errs = []; let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
      while (i < jobs.length && process.exitCode == null) { const j = jobs[i++]; try { await j(); } catch (e) { if (e.message === '__exit__') return; errs.push(e.message); console.error('  ✗', e.message); } }
    }));
    return errs;
  }
  console.log(`gerador: ${G.name} (${G.model}) · ${charJobs.length} ficha(s) · ${panelJobs.length} quadro(s)`);
  const errs = [...await pool(charJobs, CONC), ...await pool(panelJobs, CONC)]; // fichas primeiro: os quadros dependem delas
  if (process.exitCode == null) { console.log(errs.length ? `terminou com ${errs.length} erro(s)` : 'pronto.'); process.exitCode = errs.length ? 1 : 0; }
}
