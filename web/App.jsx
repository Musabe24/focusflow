import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, AreaChart, Area, CartesianGrid } from 'recharts'
import { Play, Pause, Settings as SettingsIcon, Calendar as CalendarIcon, Plus, CheckCircle2, Trash2, Pencil, BarChart2, TimerReset, Zap, Crown, X, BookOpen, Clock, ListTodo } from 'lucide-react'

// -----------------------------------------------------------------------------
// FocusFlow v4 — Server Storage + Auth + Login Overlay + Tag Manager
// -----------------------------------------------------------------------------
//  - Server-Storage via /api (credentials: include)
//  - 401 → LoginOverlay
//  - Registrierung nur möglich, solange noch kein Benutzer existiert
//  - Stoppuhr + Nachtragen + Log-Sidepanel + Tag-Manager
// -----------------------------------------------------------------------------

// ----------------------------- Utilities & Auth -----------------------------
const AUTH_EVENT = 'ff:auth'
function apiFetch(url, opts={}){
  return fetch(url, { credentials: 'include', ...opts }).then(async res => {
    if (res.status === 401) { window.dispatchEvent(new Event(AUTH_EVENT)); throw new Error('unauthorized') }
    return res
  })
}

// ----------------------------- Utilities ------------------------------------
const STORAGE_KEYS = { tasks: 'ff_tasks', tags: 'ff_tags', sessions: 'ff_sessions', settings: 'ff_settings', challenge: 'ff_challenge', draft: 'ff_draft' }
const DEFAULT_TAGS = [
  { id: 'tag-deep', name: 'Deep Work', color: '#34d399' },
  { id: 'tag-study', name: 'Study', color: '#60a5fa' },
  { id: 'tag-admin', name: 'Admin', color: '#fbbf24' },
]
const THEME_BG = 'bg-[#0b1220]'
const CARD_BG = 'bg-[#121a2b]'
const TEXT_MUTED = 'text-slate-300'

function uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 9)}` }
function todayISO(d = new Date()) { const t = new Date(d); t.setHours(0,0,0,0); return t.toISOString().slice(0,10) }
function startOfWeek(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x }
function endOfWeek(d){ const s=startOfWeek(d); const e=new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); return e }
function monthMatrix(year, month){ const first=new Date(year,month,1); const start=startOfWeek(first); const grid=[]; for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); grid.push(d) } return grid }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)) }
function fmtHMS(sec){ const h=Math.floor(sec/3600).toString().padStart(2,'0'); const m=Math.floor((sec%3600)/60).toString().padStart(2,'0'); const s=Math.floor(sec%60).toString().padStart(2,'0'); return `${h}:${m}:${s}` }
function combineDateTime(dateStr, timeStr){ const [y,m,d]=dateStr.split('-').map(Number); const [hh,mm]=timeStr.split(':').map(Number); return new Date(y,m-1,d,hh,mm,0,0) }

// ----------------------------- Persistence ----------------------------------
const SERVER_MODE = true
const API_BASE = '/api'

function useLocalStorage(key, initial){
  if (SERVER_MODE) return useServerStorage(key, initial)
  const [state, setState] = useState(()=>{ try{ const raw=localStorage.getItem(key); return raw? JSON.parse(raw) : (typeof initial==='function'? initial(): initial) }catch{ return typeof initial==='function'? initial(): initial }})
  useEffect(()=>{ try{ localStorage.setItem(key, JSON.stringify(state)) }catch{} },[key,state])
  return [state,setState]
}

function useServerStorage(key, initial){
  const apiKey = String(key).replace(/^ff_/, '')
  const [state, setState] = useState(()=> (typeof initial==='function'? initial(): initial))
  const [loaded, setLoaded] = useState(false)

  useEffect(()=>{
    let alive = true
    apiFetch(`${API_BASE}/${apiKey}`).then(r=>r.json()).then(data=>{
      if(!alive) return
      setState((data && typeof data==='object' && 'items' in data) ? data.items : (data ?? state))
      setLoaded(true)
    }).catch(()=> setLoaded(true))
    return ()=>{ alive=false }
  }, [apiKey])

  useEffect(()=>{
    if(!loaded) return
    const payload = (apiKey==='settings' || apiKey==='challenge' || apiKey==='draft') ? state : { items: state }
    apiFetch(`${API_BASE}/${apiKey}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).catch(()=>{})
  }, [apiKey, state, loaded])

  return [state, setState]
}

// ------------------------------ App Shell -----------------------------------
const NAV = [
  { key: 'plan', label: 'Plan', icon: ListTodo },
  { key: 'focus', label: 'Focus', icon: Clock },
  { key: 'review', label: 'Review', icon: BookOpen },
  { key: 'analyze', label: 'Analyze', icon: BarChart2, children: [
    { key: 'overview', label: 'Overview' },{ key: 'day', label: 'Day' },{ key: 'week', label: 'Week' },{ key: 'year', label: 'Year' }
  ]},
  { key: 'challenges', label: 'Challenges', icon: Crown },
]

export default function App(){
  const [view, setView] = useState({ key: 'focus', sub: 'overview' })
  // --- Auth overlay state
  const [needsLogin, setNeedsLogin] = useState(false)
  const [allowRegister, setAllowRegister] = useState(false)
  useEffect(() => {
    fetch('/api/auth/status', { credentials:'include' })
      .then(r=>r.ok ? r.json() : { hasUsers:true })
      .then(d => setAllowRegister(!d.hasUsers)).catch(()=>{})
    const onAuth = () => setNeedsLogin(true)
    window.addEventListener(AUTH_EVENT, onAuth)
    return () => window.removeEventListener(AUTH_EVENT, onAuth)
  }, [])

  const [tasks, setTasks] = useLocalStorage(STORAGE_KEYS.tasks, [])
  const [tags, setTags] = useLocalStorage(STORAGE_KEYS.tags, DEFAULT_TAGS)
  const [sessions, setSessions] = useLocalStorage(STORAGE_KEYS.sessions, [])
  const [settings, setSettings] = useLocalStorage(STORAGE_KEYS.settings, { focusMinutes:25, breakMinutes:5, sound:true, autoStartBreak:false, streakThreshold:5, pro:true })
  const [challenge, setChallenge] = useLocalStorage(STORAGE_KEYS.challenge, defaultChallenge)
  const [draft, setDraft] = useLocalStorage(STORAGE_KEYS.draft, { title: 'Focused Work', description: '' })

  // Focus Timer (Pomodoro)
  const [running, setRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(settings.focusMinutes*60)
  const [mode, setMode] = useState('focus')
  const [selectedTagId, setSelectedTagId] = useState(tags[0]?.id || null)
  useEffect(() => { if (selectedTagId && !tags.some(t => t.id === selectedTagId)) { setSelectedTagId(tags[0]?.id || null) } }, [tags])
  const intervalRef = useRef(null)

  useEffect(()=>{ if(!running) setSecondsLeft((mode==='focus'?settings.focusMinutes:settings.breakMinutes)*60) },[settings.focusMinutes,settings.breakMinutes,mode,running])
  useEffect(()=>{ if(!running) return; intervalRef.current&&clearInterval(intervalRef.current); intervalRef.current=setInterval(()=>{ setSecondsLeft(s=>{ if(s<=1){ clearInterval(intervalRef.current); handleTimerComplete(); return 0 } return s-1 }) },1000); return ()=>clearInterval(intervalRef.current) },[running])

  function toggleRun(){ setRunning(r=>!r) }
  function resetTimer(newMode='focus'){ setMode(newMode); setSecondsLeft((newMode==='focus'?settings.focusMinutes:settings.breakMinutes)*60); setRunning(false) }
  function beep(){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.type='sine'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.2,ctx.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3); o.start(); o.stop(ctx.currentTime+0.32) }catch{}}
  function handleTimerComplete(){ if(settings.sound) beep(); if(mode==='focus'){ const minutes=Math.round(settings.focusMinutes); const now=new Date(); const sess={ id:uid('sess'), date:todayISO(now), start:new Date(now.getTime()-minutes*60000).toISOString(), end:now.toISOString(), minutes, tagId:selectedTagId, taskId:null, title:draft.title, description:draft.description }; setSessions(p=>[sess,...p]); settings.autoStartBreak? (setMode('break'), setSecondsLeft(settings.breakMinutes*60), setRunning(true)) : resetTimer('break') } else { resetTimer('focus') } }

  // Derived Analytics
  const lifetime = useMemo(()=>({ totalMinutes:sessions.reduce((a,b)=>a+b.minutes,0), totalSessions:sessions.length, focusDays:new Set(sessions.map(s=>s.date)).size }),[sessions])
  const streakInfo = useMemo(()=>computeStreaks(sessions, settings.streakThreshold),[sessions,settings.streakThreshold])

  return (
    <div className={`min-h-screen ${THEME_BG} text-white flex`}>
      {needsLogin && <LoginOverlay allowRegister={allowRegister} />}
      {/* Sidebar */}
      <aside className="w-[230px] border-r border-white/5 px-3 py-4 hidden md:flex flex-col gap-2">
        <div className="flex items-center gap-2 px-2 py-2"><div className="h-8 w-8 rounded-lg bg-emerald-500/20 grid place-items-center"><Zap className="text-emerald-400" size={18}/></div><div><div className="font-semibold leading-tight">FocusFlow</div><div className="text-xs text-white/60 -mt-0.5">Stay focused, achieve more</div></div></div>
        {NAV.map(item=> (
          <div key={item.key}>
            <button onClick={()=>setView({key:item.key, sub:item.children?.[0]?.key||'overview'})} className={`flex w-full items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 ${view.key===item.key?'bg-white/10 text-white':TEXT_MUTED}`}>{item.icon && <item.icon size={18}/>}<span className="font-medium">{item.label}</span></button>
            {item.children && view.key===item.key && (
              <div className="ml-8 mt-1 flex flex-col gap-1">
                {item.children.map(c=> (<button key={c.key} onClick={()=>setView({key:item.key, sub:c.key})} className={`text-left text-sm px-2 py-1 rounded-lg hover:bg-white/5 ${view.sub===c.key?'bg-white/10 text-white':TEXT_MUTED}`}>{c.label}</button>))}
              </div>
            )}
          </div>
        ))}
        <div className="mt-auto"/>
        <SettingsFooter settings={settings} setSettings={setSettings} tags={tags} setTags={setTags} sessions={sessions} setSessions={setSessions} />
      </aside>

      {/* Content */}
      <main className="flex-1 p-4 md:p-8">
        {view.key==='plan' && (<PlanPage tasks={tasks} setTasks={setTasks} />)}
        {view.key==='focus' && (<FocusPage tags={tags} setTags={setTags} selectedTagId={selectedTagId} setSelectedTagId={setSelectedTagId} settings={settings} setSettings={setSettings} mode={mode} setMode={setMode} secondsLeft={secondsLeft} setSecondsLeft={setSecondsLeft} running={running} toggleRun={toggleRun} resetTimer={resetTimer} sessions={sessions} setSessions={setSessions} tasks={tasks} draft={draft} saveDraft={setDraft} />)}
        {view.key==='review' && (<ReviewPage sessions={sessions} />)}
        {view.key==='analyze' && (<AnalyzePage sessions={sessions} tags={tags} view={view} streakInfo={streakInfo} lifetime={lifetime} />)}
        {view.key==='challenges' && (<ChallengePage sessions={sessions} challenge={challenge} setChallenge={setChallenge} />)}
      </main>
    </div>
  )
}

// ------------------------------ Login Overlay ---------------------------------
function LoginOverlay({ allowRegister }){
  const [mode, setMode] = useState(allowRegister ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e){
    e.preventDefault()
    setError('')
    const path = mode === 'login' ? '/auth/login' : '/auth/register'
    const res = await fetch(`/api${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ email, password }) })
    if(res.ok){ window.location.reload(); return }
    const data = await res.json().catch(()=>({}))
    setError(data.error || 'Fehlgeschlagen')
  }

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 grid place-items-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 p-6 bg-[#121a2b]">
        <div className="text-xl font-semibold mb-2">{mode==='login'?'Anmelden':'Konto anlegen'}</div>
        {allowRegister && (
          <div className="text-xs text-white/60 mb-4">
            {mode==='login'? 'Noch kein Konto?': 'Schon ein Konto?'}{' '}
            <button className="underline" onClick={()=>setMode(mode==='login'?'register':'login')}>
              {mode==='login'? 'Konto erstellen' : 'Anmelden'}
            </button>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-3">
          <input type="email" required placeholder="E-Mail" value={email} onChange={e=>setEmail(e.target.value)} className="bg-white/10 rounded-xl px-3 py-2" />
          <input type="password" required placeholder="Passwort" value={password} onChange={e=>setPassword(e.target.value)} className="bg-white/10 rounded-xl px-3 py-2" />
          {error && <div className="text-sm text-red-300">{error}</div>}
          <button type="submit" className="mt-1 px-4 py-2 rounded-xl bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40">{mode==='login' ? 'Login' : 'Registrieren'}</button>
        </form>
      </div>
    </div>
  )
}

// ------------------------------ Settings Footer -----------------------------
function SettingsFooter({ settings, setSettings, tags, setTags, sessions, setSessions }){
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="p-2 rounded-xl bg-white/5">
        <div className="text-xs text-white/60 mb-1">Welcome</div>
        <div className="text-sm font-medium">The Vibrant and Splendid Armadillo</div>
        <div className="flex items-center justify-between mt-2">
          <button onClick={()=>setOpen(true)} className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 flex items-center gap-2"><SettingsIcon size={14}/> Settings</button>
          {settings.pro && (<div className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">PRO</div>)}
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <Modal onClose={()=>setOpen(false)} title="Settings">
            <div className="grid gap-4">
              <NumberField label="Focus length (minutes)" value={settings.focusMinutes} onChange={v=>setSettings(s=>({...s, focusMinutes:clamp(v,1,240)}))} />
              <NumberField label="Break length (minutes)" value={settings.breakMinutes} onChange={v=>setSettings(s=>({...s, breakMinutes:clamp(v,1,120)}))} />
              <ToggleField label="Play sound when timer ends" value={settings.sound} onChange={v=>setSettings(s=>({...s, sound:v}))} />
              <ToggleField label="Auto‑start break after focus" value={settings.autoStartBreak} onChange={v=>setSettings(s=>({...s, autoStartBreak:v}))} />
              <NumberField label="Streak threshold (min/day)" value={settings.streakThreshold} onChange={v=>setSettings(s=>({...s, streakThreshold:clamp(v,1,120)}))} />
              <ToggleField label="Pro Enabled (unlimited features)" value={settings.pro} onChange={v=>setSettings(s=>({...s, pro:v}))} />
              <ProPerks />
              <TagManager tags={tags} setTags={setTags} sessions={sessions} setSessions={setSessions} />
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}

function ProPerks(){
  const perks=['Unlimited Todos','Unlimited Tags','Advanced Historical Analytics','Early Supporter Benefits','Pro Features Coming Soon']
  return (
    <div className={`${CARD_BG} rounded-2xl p-4 border border-white/10`}>
      <div className="flex items-center gap-2 mb-2"><Crown className="text-emerald-300" size={18}/><div className="font-semibold">Pro Features</div></div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">{perks.map(p=> (<li key={p} className="flex items-center gap-2"><CheckCircle2 className="text-emerald-400" size={16}/> {p}</li>))}</ul>
    </div>
  )
}

function ToggleField({ label, value, onChange }){
  return (
    <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm"><span>{label}</span><button onClick={()=>onChange(!value)} className={`w-12 h-6 rounded-full relative ${value?'bg-emerald-500/40':'bg-white/20'}`}><span className={`absolute top-0.5 ${value?'left-6':'left-0.5'} h-5 w-5 rounded-full bg-white transition-all`} /></button></label>
  )
}

function NumberField({ label, value, onChange }){
  return (
    <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>{label}</span><input type="number" value={value} onChange={e=>onChange(parseInt(e.target.value||'0',10))} className="w-24 bg-white/10 px-2 py-1 rounded-lg text-right" /></label>
  )
}

function Modal({ title, children, onClose }){
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <motion.div initial={{y:30,opacity:0}} animate={{y:0,opacity:1}} exit={{y:20,opacity:0}} className={`${CARD_BG} max-w-2xl w-full rounded-2xl p-6 border border-white/10`}>
        <div className="flex items-center justify-between mb-4"><div className="text-lg font-semibold">{title}</div><button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X size={18}/></button></div>
        {children}
      </motion.div>
    </motion.div>
  )
}

// ------------------------------ Tag Manager ---------------------------------
function TagManager({ tags, setTags, sessions, setSessions }){
  function deleteTag(id){
    if(!confirm('Tag löschen? Existierende Sessions werden auf "Untagged" gesetzt.')) return
    setTags(prev => prev.filter(t => t.id !== id))
    setSessions(prev => prev.map(s => s.tagId === id ? { ...s, tagId: null } : s))
  }
  function addTag(){ const name=prompt('Neuer Tag-Name?')?.trim(); if(!name) return; const color=randomColor(); setTags(prev=>[...prev,{id:uid('tag'), name, color}]) }
  return (
    <div className={`${CARD_BG} rounded-2xl p-4 border border-white/10`}>
      <div className="flex items-center justify-between mb-3"><div className="font-semibold">Tags verwalten</div><button onClick={addTag} className="px-2 py-1 text-sm rounded-xl bg-white/10 hover:bg-white/20">+ Tag</button></div>
      <div className="grid gap-2">{tags.length===0? (<div className="text-sm text-white/60">Keine Tags vorhanden.</div>): tags.map(t=> (
        <div key={t.id} className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
          <input type="color" value={t.color} onChange={e=>setTags(prev=>prev.map(x=>x.id===t.id? { ...x, color: e.target.value } : x))} className="h-8 w-10 rounded-md bg-transparent border border-white/10" />
          <input value={t.name} onChange={e=>setTags(prev=>prev.map(x=>x.id===t.id? { ...x, name: e.target.value } : x))} className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-sm" />
          <button onClick={()=>deleteTag(t.id)} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-200 hover:bg-red-500/30">Löschen</button>
        </div>
      ))}</div>
    </div>
  )
}

// ------------------------------ Plan Page -----------------------------------
function PlanPage({ tasks, setTasks }){
  const [filter, setFilter] = useState('active')
  const [text, setText] = useState('')
  function addTask(){ const t=text.trim(); if(!t) return; setTasks(prev=>[{id:uid('task'), title:t, done:false, createdAt:new Date().toISOString()}, ...prev]); setText('') }
  function toggleTask(id){ setTasks(prev=>prev.map(t=> t.id===id? {...t, done:!t.done}:t)) }
  function removeTask(id){ setTasks(prev=>prev.filter(t=>t.id!==id)) }
  const filtered = tasks.filter(t => filter==='all'? true : filter==='active'? !t.done : t.done)
  return (
    <div className="max-w-5xl mx-auto">
      <Header title="Todo List" subtitle="Plan your day and track your tasks" />
      <div className="flex items-center gap-2 mt-4"><input value={text} onChange={e=>setText(e.target.value)} placeholder="Add a new task..." className="flex-1 rounded-xl bg-white/10 px-3 py-2" /><button onClick={addTask} className="h-10 w-10 grid place-items-center rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"><Plus size={18}/></button></div>
      <div className="flex items-center gap-2 mt-4">{['active','completed','all'].map(k=>(<button key={k} onClick={()=>setFilter(k)} className={`px-3 py-1.5 rounded-xl text-sm ${filter===k?'bg-white/20':'bg-white/10 hover:bg-white/15'}`}>{k[0].toUpperCase()+k.slice(1)}</button>))}<div className="ml-auto text-white/60 text-sm">Count: {filtered.length}</div></div>
      <div className="mt-4 grid gap-2">{filtered.length===0? (<div className={`${CARD_BG} rounded-2xl p-6 text-white/60 text-sm text-center`}>No active tasks</div>) : filtered.map(t=> (<div key={t.id} className={`${CARD_BG} rounded-2xl p-3 flex items-center gap-3 border border-white/10`}><button onClick={()=>toggleTask(t.id)} className={`h-6 w-6 rounded-full grid place-items-center ${t.done?'bg-emerald-500/30 text-emerald-300':'bg-white/10'}`}><CheckCircle2 size={16}/></button><div className={`flex-1 ${t.done?'line-through text-white/50':''}`}>{t.title}</div><button onClick={()=>removeTask(t.id)} className="p-1 rounded-lg hover:bg-white/10"><Trash2 size={16}/></button></div>))}</div>
    </div>
  )
}

function Header({ title, subtitle, right }){ return (<div className="flex items-end justify-between"><div><div className="text-2xl font-semibold">{title}</div>{subtitle && <div className="text-white/60 text-sm">{subtitle}</div>}</div>{right}</div>) }

// ------------------------------ Focus Page ----------------------------------
function FocusPage(props){
  const { tags, setTags, selectedTagId, setSelectedTagId, settings, setSettings, mode, setMode, secondsLeft, setSecondsLeft, running, toggleRun, resetTimer, sessions, setSessions, tasks, draft, saveDraft } = props
  const [showConfig, setShowConfig] = useState(false)
  const [showBackdate, setShowBackdate] = useState(false)
  const [logOpen, setLogOpen] = useState(false)

  // Stopwatch state
  const [swRunning, setSwRunning] = useState(false)
  const [swStart, setSwStart] = useState(null)
  const [swElapsed, setSwElapsed] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState(tasks?.[0]?.id || '')
  useEffect(()=>{ if(!swRunning) return; const iv=setInterval(()=>setSwElapsed(t=>t+1),1000); return ()=>clearInterval(iv) },[swRunning])

  const total = (mode==='focus'?settings.focusMinutes:settings.breakMinutes)*60
  const pct = total? (1 - secondsLeft/total): 0
  const mm = Math.floor(secondsLeft/60).toString().padStart(2,'0')
  const ss = Math.floor(secondsLeft%60).toString().padStart(2,'0')

  function addTag(){ const name=prompt('New tag name?')?.trim(); if(!name) return; const color=randomColor(); const t={id:uid('tag'), name, color}; setTags(p=>[...p,t]); setSelectedTagId(t.id) }

  function saveSession(obj){ setSessions(prev=>[obj, ...prev]) }

  return (
    <div className="max-w-6xl mx-auto relative">
      <Header title="Focus" subtitle={mode==='focus'?'Stay on task':'Take a short break'} right={
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowConfig(true)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-2"><SettingsIcon size={16}/> Configure</button>
          <button onClick={()=>setLogOpen(true)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-2"><Pencil size={16}/> Log</button>
          <button onClick={()=>setShowBackdate(true)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-2"><CalendarIcon size={16}/> Nachtragen</button>
        </div>
      } />

      {/* Circular timer */}
      <div className="mt-8 grid place-items-center">
        <div className="relative h-[360px] w-[360px]">
          <div className="absolute inset-0 rounded-full" style={{ background:`radial-gradient(closest-side, rgba(17,24,39,0) 74%, transparent 75% 100%), conic-gradient(#34d399 ${pct*360}deg, #0f172a 0)` }} />
          <div className="absolute inset-6 rounded-full grid place-items-center" style={{ background:'#0f1626' }}>
            <div className="text-center"><div className="text-white/60 text-sm mb-1">{mode==='focus'?'Focus':'Break'}</div><div className="text-5xl font-bold tracking-wider">{mm}:{ss}</div></div>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button onClick={toggleRun} className="px-5 py-3 rounded-2xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-2">{running? <Pause size={18}/> : <Play size={18}/>} {running? 'Pause':'Start Focus Session'}</button>
          <button onClick={()=>resetTimer(mode)} className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center gap-2"><TimerReset size={18}/> Reset</button>
        </div>

        <div className="mt-8 grid gap-3 w-full max-w-lg">
          <div className="text-sm text-white/60">Tag</div>
          <div className="flex items-center gap-2 flex-wrap">
            {tags.map(t=> (
              <button key={t.id} onClick={()=>setSelectedTagId(t.id)} className={`px-3 py-1.5 rounded-xl border ${selectedTagId===t.id?'border-white/30 bg-white/10':'border-white/10 bg-white/5'} flex items-center gap-2`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{background:t.color}}/>
                <span>{t.name}</span>
              </button>
            ))}
            <button onClick={addTag} className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-2"><Plus size={14}/> Add a tag</button>
          </div>
        </div>
      </div>

      {/* Stopwatch */}
      <div className="mt-10 max-w-3xl mx-auto">
        <Card title="Stopwatch" subtitle="Einfache Zeitmessung und Zuordnung zu einer Aufgabe">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/5 p-4 flex items-center justify-center"><div className="text-3xl font-bold tabular-nums">{fmtHMS(swElapsed)}</div></div>
            <div className="space-y-2">
              <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>Task</span>
                <select value={selectedTaskId} onChange={e=>setSelectedTaskId(e.target.value)} className="w-44 bg-white/10 px-2 py-1 rounded-lg">{tasks?.length? tasks.map(t=> <option key={t.id} value={t.id}>{t.title}</option>) : <option value="">(keine)</option>}</select>
              </label>
              <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>Tag</span>
                <select value={selectedTagId||''} onChange={e=>setSelectedTagId(e.target.value)} className="w-44 bg-white/10 px-2 py-1 rounded-lg">{tags.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </label>
            </div>
            <div className="flex md:flex-col gap-2">
              <button onClick={()=>{ if(!swRunning){ setSwRunning(true); if(!swStart) setSwStart(new Date()) } else { setSwRunning(false) } }} className="flex-1 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-2 justify-center">{swRunning? <Pause size={16}/> : <Play size={16}/>} {swRunning? 'Pause':'Start'}</button>
              <button onClick={()=>{ setSwRunning(false); setSwElapsed(0); setSwStart(null) }} className="flex-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 flex items-center gap-2 justify-center"><TimerReset size={16}/> Reset</button>
              <button onClick={()=>{ if(swElapsed<=0) return; const now=new Date(); const start= swStart? swStart : new Date(now.getTime()-swElapsed*1000); const minutes=Math.max(1, Math.round(swElapsed/60)); const sess={ id:uid('sess'), date:todayISO(now), start:start.toISOString(), end:now.toISOString(), minutes, tagId:selectedTagId, taskId:selectedTaskId||null, title:draft.title, description:draft.description }; saveSession(sess); setSwRunning(false); setSwElapsed(0); setSwStart(null) }} className="flex-1 px-3 py-2 rounded-xl bg-blue-500/30 text-blue-200 hover:bg-blue-500/40">Speichern</button>
            </div>
          </div>
        </Card>
      </div>

      <SideLogPanel open={logOpen} onClose={()=>setLogOpen(false)} draft={draft} onSave={saveDraft} />

      <AnimatePresence>
        {showConfig && (
          <Modal onClose={()=>setShowConfig(false)} title="Focus Configuration">
            <div className="grid gap-4">
              <NumberField label="Focus length (minutes)" value={settings.focusMinutes} onChange={v=>setSettings(s=>({...s, focusMinutes:clamp(v,1,240)}))} />
              <NumberField label="Break length (minutes)" value={settings.breakMinutes} onChange={v=>setSettings(s=>({...s, breakMinutes:clamp(v,1,120)}))} />
              <ToggleField label="Sound on completion" value={settings.sound} onChange={v=>setSettings(s=>({...s, sound:v}))} />
              <ToggleField label="Auto‑start break" value={settings.autoStartBreak} onChange={v=>setSettings(s=>({...s, autoStartBreak:v}))} />
            </div>
          </Modal>
        )}
        {showBackdate && (
          <BackdateModal tags={tags} tasks={tasks} defaultTagId={selectedTagId||tags[0]?.id} onClose={()=>setShowBackdate(false)} onSave={({date,startTime,endTime,tagId,taskId,title,description})=>{ const start=combineDateTime(date,startTime); const end=combineDateTime(date,endTime); const minutes=Math.max(1, Math.round((end-start)/60000)); if(isFinite(minutes) && minutes>0){ const sess={ id:uid('sess'), date:todayISO(start), start:start.toISOString(), end:end.toISOString(), minutes, tagId, taskId:taskId||null, title, description }; setSessions(p=>[sess,...p]) } setShowBackdate(false) }} />
        )}
      </AnimatePresence>
    </div>
  )
}

function SideLogPanel({ open, onClose, draft, onSave }){
  const [title, setTitle] = useState(draft.title)
  const [text, setText] = useState(draft.description)
  const [saved, setSaved] = useState({ title: draft.title, text: draft.description })

  useEffect(()=>{ if(open){ setTitle(draft.title); setText(draft.description); setSaved({title:draft.title, text:draft.description}) } },[open])
  const dirty = title!==saved.title || text!==saved.text

  function save(){ onSave({ title, description: text }); setSaved({ title, text }) }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }} transition={{ type:'spring', stiffness:300, damping:30 }} className="fixed top-0 right-0 h-full w-[360px] bg-[#0d1422] border-l border-white/10 z-50 p-4">
          <div className="flex items-start justify-between mb-3"><div className="font-semibold">Log Your Work</div><button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X size={16}/></button></div>
          <label className="text-xs text-white/70">Session Title</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} className="w-full mt-1 mb-3 px-3 py-2 rounded-xl bg-white/10" />
          <label className="text-xs text-white/70">Task Description</label>
          <textarea value={text} onChange={e=>setText(e.target.value)} rows={10} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/10" placeholder="Enter your task or project details...\n\nUse **bold**, *italic*, - for bullets, or 1. for numbered lists"/>
          <div className="mt-3 flex items-center justify-between text-xs text-white/60"><span>{dirty? 'Pending changes' : 'No pending changes'}</span><button disabled={!dirty} onClick={save} className={`px-3 py-1.5 rounded-xl ${dirty? 'bg-blue-500/30 text-blue-100 hover:bg-blue-500/40':'bg-white/10 text-white/60 cursor-default'}`}>{dirty? 'Save' : 'Up to Date'}</button></div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function BackdateModal({ tags, tasks, defaultTagId, onClose, onSave }){
  const [date, setDate] = useState(todayISO(new Date()))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [tagId, setTagId] = useState(defaultTagId)
  const [taskId, setTaskId] = useState(tasks?.[0]?.id || '')
  const [title, setTitle] = useState('Focused Work')
  const [desc, setDesc] = useState('')

  return (
    <Modal onClose={onClose} title="Tätigkeit nachtragen">
      <div className="grid gap-4">
        <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>Datum</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-40 bg-white/10 px-2 py-1 rounded-lg" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>Start</span><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className="w-32 bg-white/10 px-2 py-1 rounded-lg" /></label>
          <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>Ende</span><input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className="w-32 bg-white/10 px-2 py-1 rounded-lg" /></label>
        </div>
        <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>Tag</span><select value={tagId} onChange={e=>setTagId(e.target.value)} className="w-40 bg-white/10 px-2 py-1 rounded-lg">{tags.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 text-sm gap-3"><span>Task</span><select value={taskId} onChange={e=>setTaskId(e.target.value)} className="w-40 bg-white/10 px-2 py-1 rounded-lg">{tasks?.length? tasks.map(t=> <option key={t.id} value={t.id}>{t.title}</option>) : <option value="">(keine)</option>}</select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-white/70">Session Title</span><input value={title} onChange={e=>setTitle(e.target.value)} className="bg-white/10 rounded-xl p-2" /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-white/70">Task Description</span><textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} className="bg-white/10 rounded-xl p-2" placeholder="Optional"/></label>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15">Abbrechen</button><button onClick={()=>onSave({date,startTime,endTime,tagId,taskId,title,description:desc})} className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30">Speichern</button></div>
      </div>
    </Modal>
  )
}

function randomColor(){ const hues=[150,200,45,260,320,10]; const h=hues[Math.floor(Math.random()*hues.length)]; return `hsl(${h} 80% 60%)` }

// ------------------------------ Review Page ---------------------------------
function ReviewPage({ sessions }){
  const d = new Date(); const todays = sessions.filter(s=>s.date===todayISO(d)); const minutes=todays.reduce((a,b)=>a+b.minutes,0)
  return (
    <div className="max-w-5xl mx-auto">
      <Header title={d.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})} right={<span className="text-white/60 text-sm">Focus Time <strong className="mx-1">{minutes}m</strong> · Sessions <strong className="mx-1">{todays.length}</strong></span>} />
      <div className="mt-8">{todays.length===0? (<div className={`${CARD_BG} rounded-2xl p-6 text-white/70 text-center`}>No focus sessions recorded for this day. <div className="mt-3"><em>Start Focus Session</em></div></div>) : (<div className="grid gap-2">{todays.map(s=> (<div key={s.id} className={`${CARD_BG} rounded-2xl p-4 border border-white/10`}><div className="flex items-center justify-between text-sm"><div className="text-white/60">{new Date(s.start).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} – {s.minutes}m</div><div className="text-white/80 font-medium">{s.title||'Session'}</div></div><div className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{s.description||''}</div></div>))}</div>)}</div>
    </div>
  )
}

// ------------------------------ Analyze Page --------------------------------
function AnalyzePage({ sessions, tags, view, streakInfo, lifetime }){
  return (
    <div className="max-w-6xl mx-auto">
      {view.sub==='overview' && <OverviewPanel sessions={sessions} streakInfo={streakInfo} lifetime={lifetime} />}
      {view.sub==='day' && <DayAnalytics sessions={sessions} tags={tags} />}
      {view.sub==='week' && <WeekAnalytics sessions={sessions} />}
      {view.sub==='year' && <YearAnalytics sessions={sessions} />}
    </div>
  )
}

function OverviewPanel({ sessions, streakInfo, lifetime }){
  const d = new Date(); const monthGrid = monthMatrix(d.getFullYear(), d.getMonth()); const perDay = groupMinutesPerDay(sessions); const todayKey=todayISO(d)
  return (
    <div>
      <Header title="Analytics Overview" />
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <Card title="Today's Focus" subtitle={new Date().toLocaleDateString(undefined,{weekday:'long'})}><div className="grid grid-cols-2 gap-3"><Stat label="Focus Time" value={`${perDay[todayKey]||0}m`} /><Stat label="Sessions" value={`${(sessions.filter(s=>s.date===todayKey)).length}`} /></div></Card>
        <Card title="Streaks" subtitle={`${Math.max(0, streakInfo.minutesNeededToday)} more minutes needed today to maintain your streak.`}><div className="grid grid-cols-3 gap-3"><Stat label="Current Streak" value={`${streakInfo.current} days`} /><Stat label="Best Streak" value={`${streakInfo.best} days`} /><Stat label="Threshold" value={`${streakInfo.threshold}m/day`} /></div></Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card title={d.toLocaleString(undefined,{month:'long',year:'numeric'})}>
          <div className="grid grid-cols-7 gap-1">{[...'MTWTFSS'].map((c,i)=><div key={i} className="text-center text-xs text-white/50 py-1">{c}</div>)}</div>
          <div className="grid grid-cols-7 gap-1 mt-1">{monthGrid.map((date,i)=>{ const inMonth=date.getMonth()===d.getMonth(); const key=todayISO(date); const mins=perDay[key]||0; const heat=Math.min(1, mins/Math.max(1, streakInfo.threshold)); return (<div key={i} className={`aspect-square rounded-lg ${inMonth?'bg-white/5':'bg-white/5 opacity-30'}`}><div className="w-full h-full rounded-lg" style={{background:`linear-gradient(180deg, rgba(52,211,153,${0.15+heat*0.6}) 0%, rgba(52,211,153,0) 100%)`}}/></div>) })}</div>
          <div className="grid grid-cols-3 gap-3 mt-6"><MiniStat label="Days Focused" value={`${Object.keys(perDay).length}`} /><MiniStat label="Avg Focus Day" value={`${avg(Object.values(perDay))}m`} /><MiniStat label="Total Focus" value={`${lifetime.totalMinutes}m`} /></div>
        </Card>
        <Card title="Lifetime Focus"><div className="grid grid-cols-3 gap-3"><Stat label="Total Focus Time" value={`${lifetime.totalMinutes}m`} /><Stat label="Total Sessions" value={`${lifetime.totalSessions}`} /><Stat label="Focus Days" value={`${lifetime.focusDays}`} /></div></Card>
      </div>
    </div>
  )
}

function DayAnalytics({ sessions, tags }){
  const [date, setDate] = useState(todayISO(new Date())); const daySessions=sessions.filter(s=>s.date===date); const minutes=daySessions.reduce((a,b)=>a+b.minutes,0)
  const byTag = Object.entries(groupBy(daySessions, s=>s.tagId)).map(([tagId,arr])=>({ name: tags.find(t=>t.id===tagId)?.name || 'Untagged', value: arr.reduce((a,b)=>a+b.minutes,0) }))
  const timeline = daySessions.map((s,i)=>({ idx:i+1, minutes:s.minutes }))
  return (
    <div>
      <Header title={new Date(date).toLocaleDateString(undefined,{ weekday:'long', year:'numeric', month:'long', day:'numeric' })} right={<input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-white/10 px-3 py-2 rounded-xl" />} />
      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Card title="Focus Time"><Stat big value={`${minutes}m`} /></Card>
        <Card title="Focus Sessions"><Stat big value={`${daySessions.length}`} /></Card>
        <Card title="Focus Time by Tag">{byTag.length===0? <div className="text-white/60 text-sm">No focus sessions for this day.</div> : (<div className="h-48"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byTag} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70} paddingAngle={2}>{byTag.map((_,i)=><Cell key={i}/>)}</Pie><Tooltip formatter={(v)=>`${v}m`} /></PieChart></ResponsiveContainer></div>)}</Card>
      </div>
      <Card title="Daily Timeline" className="mt-4">{timeline.length===0? (<div className="text-white/60 text-sm">No focus sessions for this day.</div>) : (<div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeline}><CartesianGrid strokeDasharray="3 3" opacity={0.1}/><XAxis dataKey="idx"/><YAxis/><Tooltip formatter={(v)=>`${v}m`} /><Bar dataKey="minutes" radius={[8,8,0,0]} /></BarChart></ResponsiveContainer></div>)}</Card>
    </div>
  )
}

function WeekAnalytics({ sessions }){
  const [cursor, setCursor] = useState(todayISO(new Date())); const d=new Date(cursor); const s=startOfWeek(d), e=endOfWeek(d)
  const weekSessions=sessions.filter(x=>{ const dx=new Date(x.date); return dx>=s && dx<=e })
  const perDay = Array.from({length:7}).map((_,i)=>{ const day=new Date(s); day.setDate(s.getDate()+i); const key=todayISO(day); const minutes=weekSessions.filter(ss=>ss.date===key).reduce((a,b)=>a+b.minutes,0); return { name: day.toLocaleDateString(undefined,{weekday:'short'}), minutes } })
  const pie = perDay.map(d=>({ name:d.name, value:d.minutes }))
  return (
    <div>
      <Header title={`Week of ${s.toLocaleDateString()} - ${e.toLocaleDateString()}`} right={<div className="flex items-center gap-2"><button onClick={()=>setCursor(todayISO(new Date(s.getTime()-7*86400000)))} className="px-3 py-2 rounded-xl bg-white/10">Previous</button><input type="date" value={cursor} onChange={e=>setCursor(e.target.value)} className="bg-white/10 px-3 py-2 rounded-xl" /><button onClick={()=>setCursor(todayISO(new Date()))} className="px-3 py-2 rounded-xl bg-white/10">Today</button></div>} />
      <div className="grid lg:grid-cols-2 gap-4 mt-6"><Card title="Weekly Summary" subtitle={`Previous week: ${0}m`}><div className="grid grid-cols-2 gap-3"><Stat label="Focus Time" value={`${weekSessions.reduce((a,b)=>a+b.minutes,0)}m`} /><Stat label="Sessions" value={`${weekSessions.length}`} /></div></Card><Card title="Distribution"><div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={70} paddingAngle={2}>{pie.map((_,i)=><Cell key={i}/>)}</Pie><Tooltip formatter={(v)=>`${v}m`} /></PieChart></ResponsiveContainer></div></Card></div>
      <Card title="Daily Minutes" className="mt-4"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={perDay}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v)=>`${v}m`} /><Area type="monotone" dataKey="minutes" strokeOpacity={0.8} fillOpacity={0.2} /></AreaChart></ResponsiveContainer></div></Card>
    </div>
  )
}

function YearAnalytics({ sessions }){
  const year=new Date().getFullYear(); const days=Array.from({length:12}).map((_,m)=>{ const monthDays=monthMatrix(year,m).filter(d=>d.getMonth()===m); const total=monthDays.reduce((acc,d)=>acc + sessions.filter(s=>s.date===todayISO(d)).reduce((a,b)=>a+b.minutes,0),0); return { name:new Date(year,m,1).toLocaleString(undefined,{month:'short'}), minutes:total } })
  const overview={ focusTime:sessions.filter(s=>new Date(s.date).getFullYear()===year).reduce((a,b)=>a+b.minutes,0)/60, focusDays:new Set(sessions.filter(s=>new Date(s.date).getFullYear()===year).map(s=>s.date)).size, bestMonth: days.reduce((a,b)=>a.minutes>b.minutes?a:b,{name:'-',minutes:0}) }
  return (
    <div>
      <Header title="Yearly Analytics" right={<div className="text-white/60 text-sm">{year}</div>} />
      <div className="grid lg:grid-cols-2 gap-4 mt-6"><Card title="Summary"><div className="grid grid-cols-3 gap-3"><Stat label="Focus Time" value={`${overview.focusTime.toFixed(1)}h`} /><Stat label="Focus Days" value={`${overview.focusDays}`} /><Stat label="Best Month" value={`${overview.bestMonth.name}`} /></div></Card><Card title="Monthly Totals"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={days}><CartesianGrid strokeDasharray="3 3" opacity={0.1}/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={(v)=>`${v}m`} /><Line type="monotone" dataKey="minutes" dot={false}/></LineChart></ResponsiveContainer></div></Card></div>
    </div>
  )
}

function Card({ title, subtitle, children, className='' }){ return (<div className={`${CARD_BG} rounded-2xl border border-white/10 p-4 ${className}`}><div className="flex items-center justify-between"><div><div className="font-semibold">{title}</div>{subtitle && <div className="text-xs text-white/60">{subtitle}</div>}</div></div><div className="mt-3">{children}</div></div>) }
function Stat({ label, value, big=false }){ return (<div className="rounded-2xl bg-white/5 p-4">{label && <div className="text-xs text-white/60">{label}</div>}<div className={`font-semibold ${big?'text-3xl':'text-xl'}`}>{value}</div></div>) }
function MiniStat({ label, value }){ return (<div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-white/60">{label}</div><div className="text-sm font-semibold">{value}</div></div>) }

// ------------------------------ Challenges ----------------------------------
function defaultChallenge(){ const d=new Date(); const start=new Date(d.getFullYear(), d.getMonth(), 1); const end=new Date(d.getFullYear(), d.getMonth()+1, 0); return { month:d.getMonth(), year:d.getFullYear(), enrolled:false, goalMinutes:25, start:start.toISOString(), end:end.toISOString() } }
function ChallengePage({ sessions, challenge, setChallenge }){
  const d=new Date(); const monthName=d.toLocaleString(undefined,{month:'long'}); const days=monthMatrix(d.getFullYear(), d.getMonth()).filter(x=>x.getMonth()===d.getMonth())
  const progress=days.reduce((acc,day)=>{ const mins=sessions.filter(s=>s.date===todayISO(day)).reduce((a,b)=>a+b.minutes,0); return acc + (mins >= challenge.goalMinutes ? 1 : 0) },0)
  return (
    <div className="max-w-5xl mx-auto">
      <Header title={monthName} subtitle={`Build a consistent focus habit - how many days can you focus in ${monthName}?`} />
      <div className={`${CARD_BG} rounded-2xl p-4 border border-white/10 mt-6`}>
        <div className="flex items-center justify-between"><div><div className="font-semibold">Join the Challenge</div><div className="text-sm text-white/60">Build consistent focus habits</div></div><button onClick={()=>setChallenge(c=>({...c, enrolled:true}))} className="px-4 py-2 rounded-xl bg-blue-500/30 text-blue-200 hover:bg-blue-500/40" disabled={challenge.enrolled}>{challenge.enrolled? 'Enrolled':'Enroll in Challenge'}</button></div>
        <div className="grid md:grid-cols-3 gap-3 mt-6"><div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-white/60">Goal</div><div className="text-sm">Focus for at least {challenge.goalMinutes} minutes on as many days as possible in {monthName}</div></div><div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-white/60">Duration</div><div className="text-sm">{new Date(challenge.start).toLocaleDateString()} - {new Date(challenge.end).toLocaleDateString()}</div></div><div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-white/60">Focus</div><div className="text-sm">Consistency over quantity - build lasting habits</div></div></div>
        <div className="mt-6"><div className="font-semibold mb-2">Your Progress</div><div className="text-sm text-white/60 mb-2">{progress} of {days.length} days reached {challenge.goalMinutes}m</div><div className="grid grid-cols-7 gap-1">{days.map((day,i)=>{ const mins=sessions.filter(s=>s.date===todayISO(day)).reduce((a,b)=>a+b.minutes,0); const reached=mins>=challenge.goalMinutes; return <div key={i} className={`aspect-square rounded-md ${reached? 'bg-emerald-400':'bg-white/10'}`} /> })}</div></div>
      </div>
    </div>
  )
}

// ------------------------------ Helpers -------------------------------------
function avg(arr){ if(!arr.length) return 0; return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) }
function groupBy(arr, fn){ return arr.reduce((acc,x)=>{ const k=fn(x); (acc[k] ||= []).push(x); return acc },{}) }
function groupMinutesPerDay(sessions){ return sessions.reduce((m,s)=>{ m[s.date]=(m[s.date]||0)+s.minutes; return m },{}) }
function computeStreaks(sessions, threshold){ const days=Object.entries(groupMinutesPerDay(sessions)); const set=new Set(days.filter(([_,m])=>m>=threshold).map(([d])=>d)); let cur=0,best=0; const today=new Date(); let probe=new Date(today); while(set.has(todayISO(probe))){ cur++; probe.setDate(probe.getDate()-1) } const allDates=sessions.map(s=>new Date(s.date)).sort((a,b)=>a-b); if(allDates.length){ let run=0; let prev=null; for(const d of allDates){ const k=todayISO(d); if(set.has(k)){ if(prev && (d - prev === 86400000)) run++; else run=1; if(run>best) best=run; prev=d } } } const minutesToday=sessions.filter(s=>s.date===todayISO(today)).reduce((a,b)=>a+b.minutes,0); const minutesNeededToday=Math.max(0, threshold-minutesToday); return { current:cur, best, threshold, minutesNeededToday } }
~
