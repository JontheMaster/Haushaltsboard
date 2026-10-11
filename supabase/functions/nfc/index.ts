// NFC-Aktionen: ein Sticker löst per iPhone-Kurzbefehl eine Aktion aus.
//   POST { "action": "<slug>" }  mit  Authorization: Bearer nfc_<Token>  (persönlicher Kurzbefehl-Token)
//   oder mit der normalen Anmeldung der App (Fallback ?tap=<slug>).
//   POST { "action": "finish-timers" } + x-cron-key → abgelaufene Timer abschließen (Cron jede Minute): Push an beide, optional Todo
// Antwort: { ok, message } – message ist kurz und deutsch, der Kurzbefehl zeigt sie als Mitteilung.
// Nur bekannte Slugs, kein freier Text aus dem Kurzbefehl wird ausgeführt. Jeder Aufruf mit gültiger Person
// landet in nfc_events (auch Fehler und doppeltes Tippen, dann ok = false).
import { addItems } from '../_shared/bring.ts'
import { adminClient, corsHeaders, json, memberId } from '../_shared/http.ts'
import { APP_URL, phonesOf, pushTo } from '../_shared/push.ts'
import { startTimer } from '../_shared/timers.ts'

const db = adminClient()
const TZ = 'Europe/Berlin'
/** dieselbe Aktion derselben Person innerhalb dieser Zeit zählt nur einmal */
const DOUBLE_TAP_MS = 60_000

type Action = {
  id: string
  slug: string
  label: string
  type: 'log' | 'chore_done' | 'todo_done' | 'todo_create' | 'bring_add' | 'visit_toggle' | 'notify' | 'timer' | 'night_mode'
  icon: string
  params: Record<string, unknown>
  enabled: boolean
  private: boolean
  owner: string | null
}
type Member = { id: string; name: string; is_board: boolean }
type Result = { ok: boolean; message: string }

const berlinDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const berlinHHMM = (d: Date) => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Zeitpunkt „Tag + HH:MM“ in Berlin (Sommer- und Winterzeit) */
function berlinAt(day: string, hhmm: string): Date {
  const guess = new Date(`${day}T${hhmm}:00Z`)
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName')?.value ?? ''
  const m = name.match(/([+-])(\d{2}):(\d{2})/)
  const offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0
  return new Date(guess.getTime() - offset * 60_000)
}

/** Kennung wie in der App: „Trocknerwäsche“ → „trocknerwaesche“ (der Kurzbefehl darf auch den Namen schicken) */
const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

/** Feld „action“ aus dem Anfragetext: JSON, Formular (Kurzbefehl „Formular“) oder nur der Text */
async function readAction(req: Request): Promise<string> {
  const raw = (await req.text()).trim()
  if (!raw) return ''
  try {
    const data = JSON.parse(raw)
    if (data && typeof data === 'object') return str((data as Record<string, unknown>).action ?? (data as Record<string, unknown>).Action)
    if (typeof data === 'string') return data.trim()
  } catch {
    // kein JSON
  }
  const form = new URLSearchParams(raw)
  return str(form.get('action') ?? form.get('Action') ?? (raw.includes('=') ? '' : raw))
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Wer ruft? Persönlicher Kurzbefehl-Token (nfc_…) oder die normale Anmeldung der App */
async function caller(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (/^nfc_[0-9a-f]{48}$/.test(token)) {
    const { data } = await db.from('member_tokens').select('id, member').eq('token_hash', await sha256(token)).eq('revoked', false).maybeSingle()
    if (!data) return null
    await db.from('member_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    return data.member
  }
  return memberId(req)
}

// ───────── Aktionen ─────────

async function run(a: Action, me: Member, members: Member[]): Promise<Result> {
  const p = a.params ?? {}
  const people = members.filter((m) => !m.is_board)
  const other = people.find((m) => m.id !== me.id) ?? null

  switch (a.type) {
    case 'log':
      return { ok: true, message: `${a.label} gezählt` }

    case 'chore_done': {
      const ruleId = str(p.rule_id)
      const { data: rule } = await db.from('chore_rules').select('title, active').eq('id', ruleId).maybeSingle()
      if (!rule) return { ok: false, message: 'Die Putzplan-Aufgabe gibt es nicht mehr.' }
      if (!rule.active) return { ok: false, message: `${rule.title} ist im Putzplan gerade aus.` }
      // heutige oder nächste offene Aufgabe dieser Regel (Liegengebliebenes zuerst)
      const { data: task } = await db
        .from('chore_tasks')
        .select('id, due_date, week_start')
        .eq('rule_id', ruleId)
        .is('done_at', null)
        .order('occurs_on')
        .limit(1)
        .maybeSingle()
      if (!task) return { ok: false, message: `Für ${rule.title} steht gerade nichts an.` }
      const { error } = await db.from('chore_tasks').update({ done_at: new Date().toISOString(), done_by: me.id }).eq('id', task.id)
      return error ? { ok: false, message: 'Abhaken hat nicht geklappt.' } : { ok: true, message: `${rule.title} erledigt` }
    }

    case 'todo_done': {
      const match = str(p.match).toLowerCase()
      if (!match) return { ok: false, message: 'Bei der Aktion fehlt der Todo-Titel.' }
      const today = berlinDay(new Date())
      const { data: open } = await db.from('todos').select('id, title, due_date').is('done_at', null).lte('due_date', today)
      const hit = (open ?? []).find((t) => t.title.trim().toLowerCase() === match)
      if (!hit) return { ok: false, message: `Kein offenes Todo „${str(p.match)}“ für heute.` }
      const { error } = await db.from('todos').update({ done_at: new Date().toISOString(), done_by: me.id }).eq('id', hit.id)
      return error ? { ok: false, message: 'Abhaken hat nicht geklappt.' } : { ok: true, message: `${hit.title} erledigt` }
    }

    case 'todo_create': {
      const title = str(p.title)
      if (!title) return { ok: false, message: 'Bei der Aktion fehlt der Todo-Titel.' }
      const hours = Math.max(0, Math.min(72, Number(p.in_hours) || 0))
      const at = new Date(Date.now() + hours * 3600_000)
      const who = p.assignee === 'other' ? other : p.assignee === 'open' ? null : me.is_board ? null : me
      const { error } = await db.from('todos').insert({
        title,
        assignee: who?.id ?? null,
        due_date: berlinDay(at),
        // mit Vorlauf: Erinnerung zur Uhrzeit (geht nur raus, wenn „Erinnerungen“ an ist)
        remind_at: hours > 0 ? at.toISOString() : null,
        urgent: p.urgent === true,
      })
      if (error) return { ok: false, message: 'Todo anlegen hat nicht geklappt.' }
      const forWho = who ? (who.id === me.id ? 'für dich' : `für ${who.name}`) : 'offen'
      return { ok: true, message: hours > 0 ? `${title} ${forWho}, um ${berlinHHMM(at)}` : `${title} ${forWho}, heute` }
    }

    case 'bring_add': {
      const item = str(p.item)
      if (!item) return { ok: false, message: 'Bei der Aktion fehlt der Artikel.' }
      try {
        await addItems([{ name: item, specification: str(p.spec) }])
        return { ok: true, message: `${item} steht auf der Einkaufsliste` }
      } catch (e) {
        console.error('Bring', e)
        return { ok: false, message: 'Bring! gerade nicht erreichbar.' }
      }
    }

    case 'visit_toggle': {
      const { data: s } = await db.from('settings').select('visit_mode').eq('id', 1).single()
      const next = !s?.visit_mode
      const { error } = await db.from('settings').update({ visit_mode: next }).eq('id', 1)
      return error ? { ok: false, message: 'Besuchsmodus umschalten hat nicht geklappt.' } : { ok: true, message: next ? 'Besuchsmodus an' : 'Besuchsmodus aus' }
    }

    case 'notify': {
      const text = str(p.text) || a.label
      const to = p.to === 'both' ? people : other ? [other] : []
      const ids = to.filter((m) => m.id !== me.id || p.to === 'both').map((m) => m.id)
      if (!ids.length) return { ok: false, message: 'Niemand, an den die Mitteilung gehen kann.' }
      const sent = await pushTo(await phonesOf(ids), { title: me.name, body: text, tag: `nfc-${a.slug}`, url: APP_URL })
      const names = to.map((m) => m.name).join(' und ')
      return sent ? { ok: true, message: `Mitteilung an ${names} geschickt` } : { ok: false, message: `${names} hat kein Handy für Mitteilungen angemeldet.` }
    }

    case 'night_mode': {
      // früher ins Bett: Nachtmodus gleich an, bis zum nächsten Ende der Nacht; ist er so schon an, wieder aus
      const { data: s } = await db.from('settings').select('night_to, night_forced_until').eq('id', 1).single()
      if (s?.night_forced_until && Date.parse(s.night_forced_until) > Date.now()) {
        await db.from('settings').update({ night_forced_until: null }).eq('id', 1)
        return { ok: true, message: 'Nachtmodus aus' }
      }
      const to = String(s?.night_to ?? '06:30').slice(0, 5)
      let until = berlinAt(berlinDay(new Date()), to)
      if (until.getTime() <= Date.now()) until = berlinAt(berlinDay(new Date(Date.now() + 86400_000)), to)
      const { error } = await db.from('settings').update({ night_forced_until: until.toISOString() }).eq('id', 1)
      return error ? { ok: false, message: 'Nachtmodus einschalten hat nicht geklappt.' } : { ok: true, message: `Nachtmodus an bis ${to}. Gute Nacht` }
    }

    case 'timer': {
      // gemeinsam mit dem Alexa-Skill (_shared/timers.ts)
      const t = await startTimer(a, me.id)
      if (!t.ends) return { ok: false, message: t.noDuration ? 'Bei der Aktion fehlt die Dauer.' : 'Timer starten hat nicht geklappt.' }
      return { ok: true, message: `${t.title} läuft, fertig um ${berlinHHMM(t.ends)}` }
    }
  }
}

/** Abgelaufene Timer: Mitteilung an beide Handys, optional ein Todo ohne Person für heute (Cron jede Minute) */
async function finishTimers(): Promise<{ finished: number }> {
  const now = new Date().toISOString()
  // in einem Schritt als erledigt markieren: so kann kein zweiter Lauf denselben Timer noch mal abschließen
  const { data: due } = await db
    .from('timers')
    .update({ finished_at: now })
    .lte('ends_at', now)
    .is('finished_at', null)
    .is('cancelled_at', null)
    .select('id, label, done_text, todo_title, ends_at')
  for (const t of due ?? []) {
    // sehr alte Timer (Cron lange ausgefallen) nur still abschließen
    if (Date.now() - Date.parse(t.ends_at) > 6 * 3600_000) continue
    if (t.todo_title) {
      await db.from('todos').insert({ title: t.todo_title, assignee: null, due_date: berlinDay(new Date()) })
    }
    await pushTo(await phonesOf(null), {
      title: t.done_text || `${t.label} ist fertig`,
      body: t.todo_title ? `Neues Todo: ${t.todo_title}` : `Fertig um ${berlinHHMM(new Date(t.ends_at))}`,
      tag: `timer-${t.id}`,
      url: APP_URL,
    })
  }
  return { finished: due?.length ?? 0 }
}

// ───────── Handler ─────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Nur POST.' }, 405)
  try {
    const cronKey = req.headers.get('x-cron-key')
    if (cronKey) {
      const { data } = await db.from('push_config').select('cron_key').eq('id', 1).single()
      if (!data || cronKey !== data.cron_key) return new Response('Nicht erlaubt', { status: 403 })
      return Response.json(await finishTimers())
    }

    const member = await caller(req)
    if (!member) return json(req, { ok: false, message: 'Token ungültig oder widerrufen.' }, 401)

    const sent = await readAction(req)
    const slug = slugify(sent)
    const log = async (r: Result, a: Action | null) => {
      await db.from('nfc_events').insert({ action: slug || '(leer)', action_id: a?.id ?? null, member, ok: r.ok, message: r.message, private: a?.private ?? false })
      return r
    }
    // auch Fehler im Kurzbefehl landen in „Zuletzt getippt“, damit man sieht, was ankam
    if (!slug) return json(req, await log({ ok: false, message: 'Im Kurzbefehl fehlt das Feld „action“ (Anfragetext JSON, Schlüssel action).' }, null), 400)

    const [{ data: actions }, { data: members }] = await Promise.all([
      db.from('nfc_actions').select('id, slug, label, icon, type, params, enabled, private, owner'),
      db.from('members').select('id, name, is_board'),
    ])
    const me = (members ?? []).find((m) => m.id === member)
    if (!me) return json(req, { ok: false, message: 'Kein Mitglied.' }, 403)

    // Kennung, sonst der Name des Tags („Trocknerwäsche“)
    const list = (actions ?? []) as Action[]
    const a = list.find((x) => x.slug === slug) ?? list.find((x) => slugify(x.label) === slug) ?? null
    // private Aktion einer anderen Person: wie unbekannt behandeln (nichts verraten)
    if (!a || (a.private && a.owner !== member)) return json(req, await log({ ok: false, message: `Unbekannter Tag „${sent.slice(0, 60)}“. Prüf im Kurzbefehl den Wert bei action.` }, null), 404)
    if (!a.enabled) return json(req, await log({ ok: false, message: `${a.label} ist gerade ausgeschaltet.` }, a))

    // doppeltes Tippen: letzter erfolgreicher Aufruf derselben Person für diese Aktion
    const { data: last } = await db
      .from('nfc_events')
      .select('at')
      .eq('member', member)
      .eq('action_id', a.id)
      .eq('ok', true)
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ago = last ? Date.now() - Date.parse(last.at) : Infinity
    if (ago < DOUBLE_TAP_MS) {
      await log({ ok: false, message: 'Doppelt getippt, ignoriert' }, a)
      return json(req, { ok: true, duplicate: true, message: `Schon erledigt (vor ${Math.max(1, Math.round(ago / 1000))} s)` })
    }

    const result = await run(a, me, members ?? [])
    return json(req, await log(result, a))
  } catch (e) {
    console.error(e)
    return json(req, { ok: false, message: 'Board gerade nicht erreichbar.' }, 502)
  }
})
