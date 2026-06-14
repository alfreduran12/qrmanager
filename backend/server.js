const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'equipos.db');

// ── Middlewares ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    UNIQUE NOT NULL,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'operador',
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── Auth utils ────────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === test;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Admin por defecto si no hay usuarios
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(
    'admin', hashPassword('admin123'), 'admin'
  );
  console.log('\n  ⚠️  Usuario administrador creado:');
  console.log('     Usuario: admin');
  console.log('     Clave:   admin123');
  console.log('     Cambia la clave en el primer acceso.\n');
}

// ── Auth middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const session = db.prepare(`
    SELECT u.id as user_id, u.username, u.role
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) return res.status(401).json({ error: 'Sesión inválida o expirada' });

  req.user = { id: session.user_id, username: session.username, role: session.role };
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// ── Helpers ───────────────────────────────────────────────────
function equipoRow(row) {
  if (!row) return null;
  return { ...row, disponible: row.disponible === 1 };
}

// ── Auth routes ───────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, user.id, expiresAt);

  res.json({ token, username: user.username, role: user.role });
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

app.get('/api/auth/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
  res.json(users);
});

app.post('/api/auth/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role = 'operador' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  if (!['admin', 'operador'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });

  try {
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
      .run(username.trim(), hashPassword(password), role);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.delete('/api/auth/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

app.put('/api/auth/username', requireAuth, (req, res) => {
  const { newUsername, currentPassword } = req.body || {};
  if (!newUsername || !currentPassword) return res.status(400).json({ error: 'Faltan datos' });
  if (newUsername.trim().length < 3) return res.status(400).json({ error: 'Mínimo 3 caracteres' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  try {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername.trim(), req.user.id);
    // Invalida todas las sesiones para forzar re-login con el nuevo usuario
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ese usuario ya existe' });
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

app.put('/api/auth/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Faltan datos' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  const currentToken = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, currentToken);
  res.json({ ok: true });
});

// ── Config ────────────────────────────────────────────────────

app.get('/api/config', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg = {};
  rows.forEach(r => { cfg[r.key] = r.value; });
  res.json(cfg);
});

app.post('/api/config', requireAuth, (req, res) => {
  const { domain, sheetsUrl } = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  if (domain    !== undefined) stmt.run('domain',    domain    ?? '');
  if (sheetsUrl !== undefined) stmt.run('sheetsUrl', sheetsUrl ?? '');
  res.json({ ok: true });
});

// ── Rutas de página ───────────────────────────────────────────

// Hoja de vida pública — accesible sin auth (se escanea desde el QR)
app.get('/equipo/:serie', (req, res) => {
  const serie = decodeURIComponent(req.params.serie);
  const row = db.prepare('SELECT * FROM equipos WHERE serie = ?').get(serie);

  if (!row) {
    return res.status(404).send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Equipo no encontrado — La Madriguera</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@700;800&display=swap" rel="stylesheet">
<style>
  @font-face{font-family:'Raleway';src:url('/Material de Marca/TIPOGRAFIA Raleway-Bold.ttf') format('truetype');font-weight:700;font-display:swap;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0c0e09;color:#f2f2ed;font-family:'Raleway',sans-serif;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .wrap{max-width:400px;text-align:center;}
  .logo-img{max-width:160px;width:100%;height:auto;margin-bottom:24px;}
  .code{font-size:64px;font-weight:800;color:#3dbf32;margin-bottom:8px;line-height:1;}
  .msg{font-size:15px;color:#7a7a72;}
  .serie{margin-top:16px;font-size:12px;color:rgba(122,122,114,0.5);}
</style>
</head><body>
<div class="wrap">
  <img src="/Material de Marca/logo-la-madriguera-tipogr1.png" alt="La Madriguera" class="logo-img" />
  <p class="code">404</p>
  <p class="msg">Equipo no encontrado en el inventario.</p>
  <p class="serie">Serie: ${serie}</p>
</div>
</body></html>`);
  }

  const data = equipoRow(row);
  const specsArr = (data.specs || '').split(',').map(s => s.trim()).filter(Boolean);
  const catLabel = {
    camaras:'Cámaras', lentes:'Lentes', tripodes:'Soporte/Trípodes',
    iluminacion:'Iluminación', audio:'Audio', drones:'Drones',
    monitores:'Monitores', grip:'Grip', steadicam:'Steadicam', sliders:'Sliders',
  }[data.cat] || (data.cat || '');

  const dispBadge = data.disponible === null ? '' :
    data.disponible
      ? '<span class="disp disp-on">● Disponible</span>'
      : '<span class="disp disp-off">● No disponible</span>';

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.nombre || 'Equipo'} — La Madriguera</title>
  <link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @font-face{font-family:'Raleway';src:url('/Material de Marca/TIPOGRAFIA Raleway-Bold.ttf') format('truetype');font-weight:700;font-display:swap;}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0c0e09;color:#f2f2ed;font-family:'Raleway',sans-serif;min-height:100vh;
         -webkit-font-smoothing:antialiased;padding:24px 20px 48px;}
    .wrap{max-width:480px;margin:0 auto;}
    .logo-img{display:block;max-width:160px;width:100%;height:auto;margin-bottom:28px;}
    .accent{color:#3dbf32;}
    .cat{font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#7a7a72;margin-bottom:6px;}
    h1{font-family:'Raleway',sans-serif;font-size:48px;font-weight:800;line-height:0.92;letter-spacing:-0.01em;margin-bottom:20px;}
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
    .bar{width:32px;height:2px;background:#3dbf32;margin-bottom:24px;}
    .disp{font-size:12px;display:inline-block;margin-bottom:16px;}
    .disp-on{color:#4ade80;} .disp-off{color:#f87171;}
  </style>
</head>
<body>
  <div class="wrap">
    <img src="/Material de Marca/logo-la-madriguera-tipogr1.png" alt="La Madriguera" class="logo-img" />
    <div class="bar"></div>
    <p class="cat">${catLabel}</p>
    <h1>${data.nombre || 'Equipo'}</h1>
    ${dispBadge ? `<p>${dispBadge}</p>` : ''}
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

app.get('/api/equipos', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM equipos ORDER BY created_at DESC').all();
  res.json(rows.map(equipoRow));
});

app.get('/api/equipo/:serie', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM equipos WHERE serie = ?').get(req.params.serie);
  if (!row) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(equipoRow(row));
});

app.post('/api/equipos', requireAuth, (req, res) => {
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

app.put('/api/equipo/:serie', requireAuth, (req, res) => {
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

app.delete('/api/equipo/:serie', requireAuth, (req, res) => {
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
