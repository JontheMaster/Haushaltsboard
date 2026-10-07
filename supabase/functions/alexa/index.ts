// Alexa-Skill „Haushaltsboard“: Todos per Sprache anlegen, Einkauf auf die Bring!-Liste setzen, vorlesen, was heute ansteht.
// Alexa ruft diese Function direkt auf (ohne Supabase-Login, daher verify_jwt aus).
// Schutz: nur Anfragen mit unserer Skill-ID (Secret ALEXA_SKILL_ID) und frischem Zeitstempel.
import { addDays, berlinDay, eventsOnDay, loadEvents, mondayOf } from '../_shared/calendar.ts'
import { addItems, parseItems } from '../_shared/bring.ts'
import { adminClient } from '../_shared/http.ts'

const db = adminClient()
const TZ = 'Europe/Berlin'
/** Alexa verlangt, dass ältere Anfragen abgelehnt werden (Schutz gegen Wiederholung) */
const MAX_AGE_MS = 150 * 1000
/** So viele Todos liest Alexa höchstens vor, danach „und 3 weitere“ */
const READ_MAX = 6

type AlexaRequest = {
  session?: { application?: { applicationId?: string } }
  context?: { System?: { application?: { applicationId?: string } } }
  request: {
    type: string
    timestamp: string
    intent?: { name: string; slots?: Record<string, { value?: string }> }
  }
}

// ───────── Antworten ─────────

function speak(text: string, { reprompt, end = true }: { reprompt?: string; end?: boolean } = {}): Response {
  return Response.json({
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      ...(reprompt ? { reprompt: { outputSpeech: { type: 'PlainText', text: reprompt } } } : {}),
      shouldEndSession: end,
    },
  })
}

// ───────── Tag aus dem Satz ─────────

const WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']
const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']

type When = { due_date: string | null; this_week: boolean }
const NO_DAY: When = { due_date: null, this_week: false }

/** Wochentag 0 = Montag */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** Tag-Angabe → Datum. Wochentage meinen den nächsten (heute gesagt „am Dienstag“ = nächste Woche). */
function resolveDay(phrase: string, today: string): When | null {
  if (phrase === 'heute') return { due_date: today, this_week: false }
  if (phrase === 'morgen') return { due_date: addDays(today, 1), this_week: false }
  if (phrase === 'übermorgen') return { due_date: addDays(today, 2), this_week: false }
  if (/woche$/.test(phrase)) return { due_date: null, this_week: true }
  const wd = WEEKDAYS.indexOf(phrase)
  if (wd >= 0) return { due_date: addDays(today, ((wd - weekdayOf(today) + 6) % 7) + 1), this_week: false }
  // „12. oktober“ oder „12.10.“
  let m = phrase.match(/^(\d{1,2})\.? ?([a-zä]+)$/)
  let day: number | undefined, month: number | undefined
  if (m && MONTHS.includes(m[2])) [day, month] = [Number(m[1]), MONTHS.indexOf(m[2]) + 1]
  m = phrase.match(/^(\d{1,2})\.(\d{1,2})\.?$/)
  if (m) [day, month] = [Number(m[1]), Number(m[2])]
  if (!day || !month || month > 12 || day > 31) return null
  let year = Number(today.slice(0, 4))
  const iso = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (iso(year) < today) year++
  return { due_date: iso(year), this_week: false }
}

const DAY_WORDS = [
  'heute',
  'übermorgen',
  'morgen',
  ...WEEKDAYS,
  '(?:diese|dieser|der|die) woche',
  `\\d{1,2}\\.? ?(?:${MONTHS.join('|')})`,
  '\\d{1,2}\\.\\d{1,2}\\.?',
].join('|')
// Tag am Ende („müll rausbringen für morgen“) oder am Anfang („morgen müll rausbringen“)
const AT_END = new RegExp(`\\s+(?:für |am |bis |in |irgendwann )?(?:nächsten |kommenden |diesen )?(${DAY_WORDS})$`)
const AT_START = new RegExp(`^(?:für |am |bis |in |irgendwann )?(?:nächsten |kommenden |diesen )?(${DAY_WORDS})\\s+`)

/** Trennt eine Tag-Angabe vom Titel; ohne Angabe: noch ohne Tag */
function splitDay(raw: string, today: string): { title: string; when: When } {
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  for (const re of [AT_END, AT_START]) {
    const m = text.match(re)
    if (!m) continue
    const when = resolveDay(m[1].replace(/^(diese|dieser|der|die) /, 'diese '), today)
    const rest = text.replace(re, '').trim()
    if (when && rest) return { title: rest, when }
  }
  return { title: text, when: NO_DAY }
}

/** Wert des Slots `tag` (AMAZON.DATE), falls Alexa ihn doch füllt: „2026-10-07“, „2026-W41“, „PRESENT_REF“ */
function fromDateSlot(value: string | undefined, today: string): When | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { due_date: value < today ? today : value, this_week: false }
  if (value === 'PRESENT_REF') return { due_date: today, this_week: false }
  if (/^\d{4}-W\d{2}/.test(value)) return { due_date: null, this_week: true }
  return null
}

function whenText(when: When, today: string): string {
  if (when.this_week) return 'für diese Woche'
  if (!when.due_date) return 'noch ohne Tag'
  if (when.due_date === today) return 'für heute'
  if (when.due_date === addDays(today, 1)) return 'für morgen'
  if (when.due_date === addDays(today, 2)) return 'für übermorgen'
  const name = WEEKDAYS[weekdayOf(when.due_date)]
  const label = name[0].toUpperCase() + name.slice(1)
  if (when.due_date < addDays(today, 7)) return `für ${label}`
  const [, m, d] = when.due_date.split('-').map(Number)
  return `für ${label}, den ${d}. ${MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1)}`
}

// ───────── Füllwörter ─────────

// Je nach Satz („wir müssen noch …“, „dass wir … müssen“) landen Reste im freien Text. Vorn und hinten abschneiden.
const TODO_HEAD = /^(?:(?:dass|daß|bitte|noch|mal|unbedingt|auch|wir|ich|jemand|einer|müssen|muss|sollten|sollte)\s+)+/
const TODO_TAIL = /(?:\s+(?:müssen|muss|sollten|sollte|eintragen|aufschreiben|notieren|hinzufügen|vormerken|nicht vergessen|bitte))+$/
const ITEM_HEAD = /^(?:(?:bitte|noch|mal|wieder|unbedingt|auch|wir|ich|brauchen|brauche)\s+)+/
const ITEM_TAIL = /\s+(?:(?:(?:ist|sind)\s+)?(?:alle|leer|aus|fast leer)|einkaufen|kaufen|besorgen|bitte)$/

function cleanTodo(text: string): string {
  return text.replace(TODO_HEAD, '').replace(TODO_TAIL, '').trim()
}

function cleanItem(text: string): string {
  return text.replace(ITEM_HEAD, '').replace(ITEM_TAIL, '').trim()
}

// ───────── Intents ─────────

// „… auf die Einkaufsliste“ am Ende: das ist Einkauf, kein Todo (falls Alexa den falschen Intent wählt)
const SHOPPING = /\s+(auf|zur|in die|zu der)\s+(die\s+)?(einkaufsliste|einkaufs liste|bring( liste)?|liste)$/i

/** Artikel auf die Bring!-Liste „Zuhause“ */
async function addShopping(raw: string | undefined): Promise<Response> {
  const text = cleanItem(raw?.trim().toLowerCase().replace(SHOPPING, '') ?? '')
  if (!text) return speak('Was soll auf die Einkaufsliste?', { end: false, reprompt: 'Sag zum Beispiel: setz Milch auf die Einkaufsliste.' })
  const items = parseItems(text)
  try {
    await addItems(items)
  } catch (e) {
    console.error(e)
    return speak('Bring ist gerade nicht erreichbar. Versuch es bitte gleich noch einmal.')
  }
  const names = items.map((i) => i.name)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0]
  return speak(`Okay, ${list} ${names.length > 1 ? 'stehen' : 'steht'} auf der Einkaufsliste.`)
}

async function addTodo(slots: Record<string, { value?: string }> | undefined): Promise<Response> {
  const raw = cleanTodo(slots?.titel?.value?.trim().toLowerCase() ?? '')
  if (raw && SHOPPING.test(raw)) return addShopping(raw)
  if (!raw) return speak('Was soll ich eintragen? Sag zum Beispiel: trag Müll rausbringen für morgen ein.', { end: false, reprompt: 'Was soll ich eintragen?' })

  const today = berlinDay(new Date())
  const split = splitDay(raw, today)
  const when = fromDateSlot(slots?.tag?.value, today) ?? split.when
  // nach dem Abtrennen des Tages können wieder Füllwörter vorn stehen („morgen noch …“)
  const clean = cleanTodo(split.title) || split.title
  // Alexa liefert alles klein: wenigstens der Anfang groß
  const title = clean[0].toUpperCase() + clean.slice(1)

  // Per Sprache angelegte Todos sind immer „Offen“ (Alexa weiß nicht, wer spricht)
  const { error } = await db.from('todos').insert({ title, assignee: null, ...when })
  if (error) {
    console.error(error)
    return speak('Das hat leider nicht geklappt. Versuch es bitte gleich noch einmal.')
  }
  return speak(`Okay, ${title} steht ${whenText(when, today)} auf dem Board.`)
}

function timeText(iso: string): string {
  const [h, m] = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':')
  return m === '00' ? `${Number(h)} Uhr` : `${Number(h)} Uhr ${Number(m)}`
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
}

async function whatsUp(): Promise<Response> {
  const today = berlinDay(new Date())
  const monday = mondayOf(today)
  const [{ data: todos }, { data: chores }, { data: members }, calendar] = await Promise.all([
    db.from('todos').select('title, due_date, this_week, assignee').is('done_at', null),
    db.from('chore_tasks').select('rule_id, due_date, week_start, assignee, occurs_on, chore_rules(title)').is('done_at', null).order('occurs_on'),
    db.from('members').select('id, name, is_board'),
    // Alexa spricht laut im Raum: Kalender, die im Besuchsmodus verschwinden, liest sie nie vor
    loadEvents({ hideAlways: true }).catch(() => null),
  ])
  const nameOf = new Map((members ?? []).filter((m) => !m.is_board).map((m) => [m.id, m.name]))

  // Heute fällig (auch Liegengebliebenes); Putzplan je Regel nur die älteste offene Aufgabe
  type Item = { title: string; assignee: string | null }
  const dueToday: Item[] = (todos ?? []).filter((t) => t.due_date && t.due_date <= today)
  const seen = new Set<string>()
  for (const c of chores ?? []) {
    if (c.due_date ? c.due_date > today : c.week_start > monday) continue
    if (!c.due_date) continue // „irgendwann in der Woche“ zählt zu „diese Woche“
    if (seen.has(c.rule_id)) continue
    seen.add(c.rule_id)
    const rule = c.chore_rules as unknown as { title: string } | null
    dueToday.push({ title: rule?.title ?? 'Putzplan', assignee: c.assignee })
  }
  const weekCount =
    (todos ?? []).filter((t) => !t.due_date && t.this_week).length +
    (chores ?? []).filter((c) => !c.due_date && c.week_start <= monday).length

  const parts: string[] = []

  const events = calendar ? eventsOnDay(calendar.events, today) : []
  if (events.length) {
    const said = events.map((e) => (e.allDay ? e.title : `um ${timeText(e.start)} ${e.title}`))
    parts.push(`Termine heute: ${listText(said)}.`)
  } else if (calendar) {
    parts.push('Heute stehen keine Termine im Kalender.')
  }

  if (dueToday.length) {
    const shown = dueToday.slice(0, READ_MAX)
    const groups = new Map<string, string[]>()
    for (const t of shown) {
      const who = t.assignee ? (nameOf.get(t.assignee) ?? 'Offen') : 'Offen'
      groups.set(who, [...(groups.get(who) ?? []), t.title])
    }
    const said = [...groups].map(([who, titles]) => `${who === 'Offen' ? 'offen' : `für ${who}`}: ${listText(titles)}`)
    const rest = dueToday.length - shown.length
    parts.push(`Zu tun heute, ${said.join('; ')}${rest > 0 ? `, und ${rest} weitere` : ''}.`)
  } else {
    parts.push('Für heute ist kein Todo mehr offen.')
  }
  if (weekCount) parts.push(`Diese Woche ${weekCount === 1 ? 'ist noch ein Todo' : `sind noch ${weekCount} Todos`} offen.`)

  return speak(parts.join(' '))
}

// ───────── Handler ─────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Methode nicht erlaubt', { status: 405 })

  let body: AlexaRequest
  try {
    body = await req.json()
  } catch {
    return new Response('Ungültige Anfrage', { status: 400 })
  }

  const skillId = Deno.env.get('ALEXA_SKILL_ID')?.trim()
  const appId = body.session?.application?.applicationId ?? body.context?.System?.application?.applicationId
  if (!skillId || appId !== skillId) {
    console.error('Fremde oder fehlende Skill-ID', { configured: !!skillId })
    return new Response('Nicht erlaubt', { status: 403 })
  }
  if (Math.abs(Date.now() - Date.parse(body.request?.timestamp)) > MAX_AGE_MS) {
    return new Response('Anfrage zu alt', { status: 400 })
  }

  const r = body.request
  try {
    if (r.type === 'LaunchRequest') {
      return speak('Hallo! Was steht an? Oder frag mich, was heute los ist.', {
        end: false,
        reprompt: 'Sag zum Beispiel: wir müssen morgen den Müll rausbringen, oder: wir brauchen Milch.',
      })
    }
    if (r.type === 'SessionEndedRequest') return Response.json({ version: '1.0', response: {} })
    if (r.type !== 'IntentRequest' || !r.intent) return speak('Das habe ich nicht verstanden.')

    switch (r.intent.name) {
      case 'TodoAnlegen':
        return await addTodo(r.intent.slots)
      case 'WasStehtAn':
        return await whatsUp()
      case 'EinkaufHinzufuegen':
        return await addShopping(r.intent.slots?.artikel?.value)
      case 'AMAZON.HelpIntent':
        return speak(
          'Sag einfach, was ansteht, zum Beispiel: wir müssen morgen den Müll rausbringen. Oder was fehlt: wir brauchen Milch. Oder frag: was steht heute an?',
          { end: false, reprompt: 'Was möchtest du tun?' },
        )
      case 'AMAZON.FallbackIntent':
        return speak('Das habe ich nicht verstanden. Sag zum Beispiel: wir müssen den Müll rausbringen, oder: wir brauchen Milch.', {
          end: false,
          reprompt: 'Was soll ich eintragen?',
        })
      case 'AMAZON.StopIntent':
      case 'AMAZON.CancelIntent':
      case 'AMAZON.NavigateHomeIntent':
        return speak('Bis später!')
      default:
        return speak('Das kann ich noch nicht. Sag zum Beispiel: trag Müll rausbringen ein.', {
          end: false,
          reprompt: 'Was soll ich eintragen?',
        })
    }
  } catch (e) {
    console.error(e)
    return speak('Da ist gerade etwas schiefgelaufen. Versuch es bitte gleich noch einmal.')
  }
})
