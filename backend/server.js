const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'equipos.db');

// ── Middlewares ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Sirve el frontend (qr-system/index.html) desde la raíz
app.use(express.static(path.join(__dirname, '..')));

// ── Base de datos ─────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS equipos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    serie       TEXT    UNIQUE NOT NULL,
    nombre      TEXT    NOT NULL,
    cat         TEXT    NOT NULL,
    specs       TEXT    DEFAULT '',
    desc        TEXT    DEFAULT '',
    disponible  INTEGER DEFAULT 1,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Helpers ───────────────────────────────────────────────────
function equipoRow(row) {
  if (!row) return null;
  return { ...row, disponible: row.disponible === 1 };
}

// ── Config ────────────────────────────────────────────────────

// GET /api/config — devuelve domain y sheetsUrl guardados
app.get('/api/config', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg = {};
  rows.forEach(r => { cfg[r.key] = r.value; });
  res.json(cfg);
});

// POST /api/config — guarda domain y/o sheetsUrl
app.post('/api/config', (req, res) => {
  const { domain, sheetsUrl } = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  if (domain    !== undefined) stmt.run('domain',    domain    ?? '');
  if (sheetsUrl !== undefined) stmt.run('sheetsUrl', sheetsUrl ?? '');
  res.json({ ok: true });
});

// ── Rutas de página ───────────────────────────────────────────

// Hoja de vida pública — escaneada desde el QR
// URL: /equipo?id=SERIE&n=Nombre&c=cat&sp=specs&desc=...
app.get('/equipo', (req, res) => {
  const { id: serie, n: nombre, c: cat, sp: specs, desc } = req.query;

  const row = serie
    ? db.prepare('SELECT * FROM equipos WHERE serie = ?').get(serie)
    : null;

  const data = row
    ? equipoRow(row)
    : { serie, nombre, cat, specs, desc, disponible: null };

  const specsArr = (data.specs || '').split(',').map(s => s.trim()).filter(Boolean);
  const catLabel = {
    camaras:'Cámaras', lentes:'Lentes', tripodes:'Soporte/Trípodes',
    iluminacion:'Iluminación', audio:'Audio', drones:'Drones',
    monitores:'Monitores', grip:'Grip', steadicam:'Steadicam', sliders:'Sliders',
  }[data.cat] || (data.cat || '');

  const dispBadge = data.disponible === null ? '' :
    data.disponible
      ? '<span style="color:#4ade80;font-size:12px;">● Disponible</span>'
      : '<span style="color:#f87171;font-size:12px;">● No disponible</span>';

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.nombre || 'Equipo'} — La Madriguera</title>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0c0e09;color:#f2f2ed;font-family:'Outfit',sans-serif;min-height:100vh;
         -webkit-font-smoothing:antialiased;padding:24px 20px 48px;}
    .wrap{max-width:480px;margin:0 auto;}
    .brand{font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#7a7a72;margin-bottom:28px;}
    .accent{color:#c5e829;}
    .cat{font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#7a7a72;margin-bottom:6px;}
    h1{font-family:'Bebas Neue',sans-serif;font-size:52px;line-height:0.9;margin-bottom:20px;}
    .divider{height:1px;background:rgba(255,255,255,0.08);margin:20px 0;}
    .row{display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;
         border-top:1px solid rgba(255,255,255,0.05);font-size:13px;gap:12px;}
    .row-label{color:#7a7a72;flex-shrink:0;}
    .row-value{text-align:right;font-weight:500;line-height:1.4;}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px;}
    .chip{padding:5px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
          font-size:11px;color:#7a7a72;}
    .footer-note{margin-top:40px;font-size:11px;color:rgba(122,122,114,0.5);text-align:center;
                 letter-spacing:0.06em;}
    .bar{width:32px;height:2px;background:#c5e829;margin-bottom:24px;}
  </style>
</head>
<body>
  <div class="wrap">
    <p class="brand">LA MADRIGUERA <span class="accent">·</span> RENTAL HOUSE</p>
    <div class="bar"></div>
    <p class="cat">${catLabel}</p>
    <h1>${data.nombre || 'Equipo'}</h1>
    ${dispBadge ? `<p style="margin-bottom:16px;">${dispBadge}</p>` : ''}
    <div class="divider"></div>
    ${data.serie ? `<div class="row"><span class="row-label">N° de serie</span><span class="row-value">${data.serie}</span></div>` : ''}
    ${data.desc  ? `<div class="row"><span class="row-label">Descripción</span><span class="row-value" style="color:#7a7a72;font-size:12px;">${data.desc}</span></div>` : ''}
    ${specsArr.length ? `<div class="chips">${specsArr.map(s=>`<span class="chip">${s}</span>`).join('')}</div>` : ''}
    <p class="footer-note">La Madriguera Rental House · Bogotá, Colombia</p>
  </div>
</body>
</html>`);
});

// ── API REST ──────────────────────────────────────────────────

// GET /api/equipos — lista todos
app.get('/api/equipos', (_req, res) => {
  const rows = db.prepare('SELECT * FROM equipos ORDER BY created_at DESC').all();
  res.json(rows.map(equipoRow));
});

// GET /api/equipo/:serie — obtiene uno por número de serie
app.get('/api/equipo/:serie', (req, res) => {
  const row = db.prepare('SELECT * FROM equipos WHERE serie = ?').get(req.params.serie);
  if (!row) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(equipoRow(row));
});

// POST /api/equipos — crea un equipo
app.post('/api/equipos', (req, res) => {
  const { serie, nombre, cat, specs = '', desc = '', disponible = true } = req.body;

  if (!serie?.trim() || !nombre?.trim() || !cat?.trim()) {
    return res.status(400).json({ error: 'serie, nombre y cat son requeridos' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO equipos (serie, nombre, cat, specs, desc, disponible)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(serie.trim(), nombre.trim(), cat.trim(), specs, desc, disponible ? 1 : 0);

    const row = db.prepare('SELECT * FROM equipos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(equipoRow(row));
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Ya existe un equipo con la serie "${serie}"` });
    }
    res.status(500).json({ error: 'Error al guardar el equipo' });
  }
});

// PUT /api/equipo/:serie — actualiza un equipo
app.put('/api/equipo/:serie', (req, res) => {
  const { nombre, cat, specs, desc, disponible } = req.body;
  const existing = db.prepare('SELECT id FROM equipos WHERE serie = ?').get(req.params.serie);
  if (!existing) return res.status(404).json({ error: 'Equipo no encontrado' });

  db.prepare(`
    UPDATE equipos SET
      nombre     = COALESCE(?, nombre),
      cat        = COALESCE(?, cat),
      specs      = COALESCE(?, specs),
      desc       = COALESCE(?, desc),
      disponible = COALESCE(?, disponible),
      updated_at = datetime('now')
    WHERE serie = ?
  `).run(
    nombre ?? null, cat ?? null, specs ?? null, desc ?? null,
    disponible !== undefined ? (disponible ? 1 : 0) : null,
    req.params.serie
  );

  const row = db.prepare('SELECT * FROM equipos WHERE serie = ?').get(req.params.serie);
  res.json(equipoRow(row));
});

// DELETE /api/equipo/:serie — elimina un equipo
app.delete('/api/equipo/:serie', (req, res) => {
  const info = db.prepare('DELETE FROM equipos WHERE serie = ?').run(req.params.serie);
  if (info.changes === 0) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  La Madriguera QR API`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Servidor:   http://localhost:${PORT}`);
  console.log(`  Sistema QR: http://localhost:${PORT}/index.html`);
  console.log(`  API:        http://localhost:${PORT}/api/equipos\n`);
});
