import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(cors())                  // gleiches Origin via Nginx-Proxy → ok
app.use(morgan('dev'))
app.use(cookieParser())

// ------------------------------------------------------------------
// JWT/Cookie-Settings
// ------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_change_me'
if (JWT_SECRET === 'dev_insecure_change_me') {
  console.warn('Warning: using insecure default JWT secret; set JWT_SECRET in production')
}
const COOKIE_NAME = 'ff_token'
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '') === 'true' // bei HTTPS → true
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined

function issueCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: COOKIE_SECURE,
    domain: COOKIE_DOMAIN,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  })
}

// ------------------------------------------------------------------
// DB & Migration
// ------------------------------------------------------------------
const DB_PATH = process.env.DB_PATH || '/data/focusflow.sqlite'
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Users
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
)`).run()

// Key/Value pro Benutzer
db.prepare(`
  CREATE TABLE IF NOT EXISTS kv (
    user_id TEXT NOT NULL,
    key     TEXT NOT NULL,
    value   TEXT NOT NULL,
    PRIMARY KEY(user_id, key)
)`).run()

// Migration: altes kv ohne user_id → user_id='public'
try {
  const cols = db.prepare(`PRAGMA table_info(kv)`).all()
  const hasUserId = cols.some(c => c.name === 'user_id')
  if (!hasUserId) {
    db.exec(`
      BEGIN;
      CREATE TABLE kv2 (user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(user_id,key));
      INSERT INTO kv2(user_id,key,value) SELECT 'public', key, value FROM kv;
      DROP TABLE kv;
      ALTER TABLE kv2 RENAME TO kv;
      COMMIT;
    `)
  }
} catch { /* no-op */ }

function read(userId, key, defVal) {
  const row = db.prepare('SELECT value FROM kv WHERE user_id=? AND key=?').get(userId, key)
  if (!row) return defVal
  try { return JSON.parse(row.value) } catch { return defVal }
}
function write(userId, key, val) {
  db.prepare(
    'INSERT INTO kv(user_id,key,value) VALUES (?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value'
  ).run(userId, key, JSON.stringify(val))
}

// Defaults pro User (beim ersten Zugriff)
function defaultChallenge() {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { month: d.getMonth(), year: d.getFullYear(), enrolled: false, goalMinutes: 25, start: start.toISOString(), end: end.toISOString() }
}
const defaultTags = [
  { id: 'tag-deep',  name: 'Deep Work', color: '#34d399' },
  { id: 'tag-study', name: 'Study',     color: '#60a5fa' },
  { id: 'tag-admin', name: 'Admin',     color: '#fbbf24' }
]

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------
app.get('/auth/status', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) as c FROM users').get()
  res.json({ hasUsers: row.c > 0 })
})

app.post('/auth/register', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  if (count > 0) return res.status(403).json({ error: 'registration disabled' })
  const id = crypto.randomUUID()
  const hash = bcrypt.hashSync(password, 12)
  try {
    db.prepare(`INSERT INTO users(id,email,password_hash,created_at) VALUES (?,?,?,?)`)
      .run(id, String(email).toLowerCase(), hash, new Date().toISOString())
  } catch (e) {
    return res.status(400).json({ error: 'email already used' })
  }
  // Default-Daten für neuen Benutzer
  write(id, 'tasks', [])
  write(id, 'tags', defaultTags)
  write(id, 'sessions', [])
  write(id, 'settings', { focusMinutes:25, breakMinutes:5, sound:true, autoStartBreak:false, streakThreshold:5, pro:true })
  write(id, 'challenge', defaultChallenge())
  write(id, 'draft', { title:'Focused Work', description:'' })
  issueCookie(res, id)
  res.json({ ok: true })
})

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase())
  if (!u) return res.status(401).json({ error: 'invalid credentials' })
  const ok = bcrypt.compareSync(password, u.password_hash)
  if (!ok) return res.status(401).json({ error: 'invalid credentials' })
  issueCookie(res, u.id)
  res.json({ ok: true })
})

app.post('/auth/logout', (req, res) => {
  res.cookie(COOKIE_NAME, '', { httpOnly:true, sameSite:'Lax', secure:COOKIE_SECURE, domain:COOKIE_DOMAIN, path:'/', maxAge:0 })
  res.json({ ok: true })
})

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.sub
    next()
  } catch {
    return res.status(401).json({ error: 'unauthorized' })
  }
}

// ------------------------------------------------------------------
// Health
// ------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }))

// ------------------------------------------------------------------
// Daten-Endpoints (geschützt)
// ------------------------------------------------------------------
const listKeys = ['tasks','tags','sessions']
const objKeys  = ['settings','challenge','draft']

app.get('/:key('+listKeys.join('|')+')', requireAuth, (req, res) => {
  res.json({ items: read(req.userId, req.params.key, []) })
})
app.put('/:key('+listKeys.join('|')+')', requireAuth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  write(req.userId, req.params.key, items)
  res.json({ ok: true, count: items.length })
})

app.get('/:key('+objKeys.join('|')+')', requireAuth, (req, res) => {
  res.json(read(req.userId, req.params.key, {}))
})
app.put('/:key('+objKeys.join('|')+')', requireAuth, (req, res) => {
  write(req.userId, req.params.key, req.body || {})
  res.json({ ok: true })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log('API listening on ' + port))
