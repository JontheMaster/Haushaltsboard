// Haushaltsboard-Widget für Scriptable (iPhone). Wird vom kleinen Start-Skript geladen, das in Scriptable liegt
// (App → Alle Funktionen → Handy-Widget). TOKEN kommt von dort. Größen: klein, mittel, groß.
// Änderungen hier wirken beim nächsten Aktualisieren des Widgets von selbst.
//
// Das Widget passt sich an: oben steht immer, was gerade am wichtigsten ist („Fokus“):
//   Weg (wann los, womit) > laufender/gleich beginnender Termin > Kochen > abends: morgen > sonst: der Tag.

const API = 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/widget?t='
const APP = 'https://jonthemaster.github.io/Haushaltsboard/'

// Farben wie das Board, Design „Campfire“ (hell / dunkel)
const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark))
const C = {
  bgTop: dyn('#FFFFFF', '#1E2824'),
  bgBottom: dyn('#EEF2EA', '#121917'),
  card: dyn('#F4EDE4', '#26302C'),
  ink: dyn('#1D2925', '#EEF2EC'),
  muted: dyn('#55635D', '#A2AFA8'),
  accent: dyn('#A84E1C', '#F4BE82'),
  accentSoft: dyn('#FCEBDC', '#3D2C19'),
  me: dyn('#2F5D86', '#A9C7E6'),
  ok: dyn('#4A7034', '#BCD49A'),
  okSoft: dyn('#E3EDD8', '#24301A'),
  warn: dyn('#8A6A12', '#ECD18A'),
  warnSoft: dyn('#F6ECCB', '#383017'),
  late: dyn('#B3412F', '#F0897A'),
  lateSoft: dyn('#F8DEDA', '#3A1E1C'),
}

const family = config.widgetFamily || 'medium'
const small = family === 'small'
const large = family === 'large'
const fm = FileManager.local()
const cachePath = fm.joinPath(fm.documentsDirectory(), 'haushaltsboard-daten.json')
const now = new Date()

// ───────── Daten ─────────

async function load() {
  try {
    const req = new Request(API + TOKEN)
    req.timeoutInterval = 20
    const data = await req.loadJSON()
    if (data && !data.error) {
      fm.writeString(cachePath, JSON.stringify(data))
      return { data, stale: false }
    }
    if (data && data.error) return { error: data.error }
  } catch (e) {
    // offline: letzter Stand
  }
  if (fm.fileExists(cachePath)) return { data: JSON.parse(fm.readString(cachePath)), stale: true }
  return { error: 'Keine Verbindung' }
}

const at = (iso) => (iso ? new Date(iso) : null)
const minsUntil = (d) => (d ? (d.getTime() - now.getTime()) / 60000 : Infinity)

// Termine nach der aktuellen Uhrzeit beurteilen (die Daten können bis zu 30 Min alt sein)
const isOver = (e) => !e.allDay && minsUntil(at(e.endIso)) <= 0
const isRunning = (e) => !e.allDay && minsUntil(at(e.startIso)) <= 0 && !isOver(e)
const todayLeft = (data) => ((data.events && data.events.today) || []).filter((e) => !isOver(e))

/** Was ist gerade am wichtigsten? */
function pickFocus(data) {
  const t = data.trip
  if (t && t.leaveAt) {
    const leave = minsUntil(at(t.leaveAt))
    const dep = minsUntil(at(t.dep))
    // ab 3 Stunden vorher, bis die Bahn weg ist
    if (leave < 180 && dep > -1) return { kind: 'trip', trip: t }
  }
  const timed = todayLeft(data).filter((e) => !e.allDay)
  const running = timed.find(isRunning)
  if (running) return { kind: 'event', event: running, now: true }
  const soon = timed.find((e) => minsUntil(at(e.startIso)) > 0 && minsUntil(at(e.startIso)) <= 60)
  if (soon) return { kind: 'event', event: soon, now: false }
  if (data.meal && data.meal.time) {
    const [h, m] = data.meal.time.split(':').map(Number)
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    const mins = minsUntil(d)
    if (mins <= 45 && mins > -30) return { kind: 'meal', meal: data.meal, at: d }
  }
  if (now.getHours() >= 20) return { kind: 'tomorrow' }
  return { kind: 'day' }
}

// ───────── Bausteine ─────────

function weatherSymbol(code, isDay) {
  if (code === 0) return isDay ? 'sun.max.fill' : 'moon.stars.fill'
  if (code <= 2) return isDay ? 'cloud.sun.fill' : 'cloud.moon.fill'
  if (code === 3) return 'cloud.fill'
  if (code <= 48) return 'cloud.fog.fill'
  if (code <= 57) return 'cloud.drizzle.fill'
  if (code <= 67 || (code >= 80 && code <= 82)) return 'cloud.rain.fill'
  if (code <= 77 || code === 85 || code === 86) return 'cloud.snow.fill'
  return 'cloud.bolt.rain.fill'
}

function vehicleSymbol(product) {
  const p = (product || '').toLowerCase()
  if (p.includes('bus')) return 'bus.fill'
  if (p.includes('u-bahn') || p.includes('straßenbahn') || p.includes('tram')) return 'tram.fill'
  if (p.includes('bahn') || p.includes('zug') || p.includes('regional')) return 'train.side.front.car'
  return 'tram.fill'
}

function symbol(stack, name, size, color) {
  const img = stack.addImage(SFSymbol.named(name).image)
  img.imageSize = new Size(size, size)
  img.tintColor = color
  return img
}

function text(stack, value, font, color, lines = 1) {
  const t = stack.addText(String(value))
  t.font = font
  t.textColor = color
  t.lineLimit = lines
  return t
}

function hstack(parent, spacing = 5) {
  const s = parent.addStack()
  s.layoutHorizontally()
  s.centerAlignContent()
  s.spacing = spacing
  return s
}

function vstack(parent, spacing = 2) {
  const s = parent.addStack()
  s.layoutVertically()
  s.spacing = spacing
  return s
}

const F = {
  eyebrow: Font.boldRoundedSystemFont(11),
  big: Font.boldRoundedSystemFont(small ? 26 : 28),
  title: Font.semiboldRoundedSystemFont(small ? 14 : 15),
  body: Font.mediumRoundedSystemFont(13),
  small: Font.mediumRoundedSystemFont(12),
  tiny: Font.regularRoundedSystemFont(10),
  time: Font.semiboldRoundedSystemFont(12),
}

/** kleine Kopfzeile über einem Block: Symbol + Wort in Akzentfarbe */
function eyebrow(stack, sym, label, color = C.accent) {
  const r = hstack(stack, 4)
  symbol(r, sym, 11, color)
  text(r, label.toUpperCase(), F.eyebrow, color)
  return r
}

/** Pille, z. B. „knapp“ */
function chip(stack, label, fg, bg) {
  const c = stack.addStack()
  c.backgroundColor = bg
  c.cornerRadius = 7
  c.setPadding(2, 6, 2, 6)
  text(c, label, F.eyebrow, fg)
  return c
}

/** Zeitpunkt, der sich im Widget von selbst mitzählt („in 12 Min.“) */
function liveRelative(stack, date, font, color) {
  const d = stack.addDate(date)
  d.applyRelativeStyle()
  d.font = font
  d.textColor = color
  d.lineLimit = 1
  d.minimumScaleFactor = 0.7
  return d
}

// ───────── Fokus-Karten ─────────

function tripCard(parent, t) {
  const status = {
    ok: ['pünktlich', C.ok, C.okSoft],
    tight: ['knapp', C.warn, C.warnSoft],
    late: [`+${t.lateMin} Min`, C.late, C.lateSoft],
    none: ['keine Verbindung', C.late, C.lateSoft],
  }[t.status] || ['', C.muted, C.card]

  const head = hstack(parent, 4)
  eyebrow(head, 'figure.walk', 'Los')
  head.addSpacer()
  if (!small || t.status !== 'ok') chip(head, status[0], status[1], status[2])
  parent.addSpacer(2)

  const leave = at(t.leaveAt)
  if (minsUntil(leave) <= 0) text(parent, 'Jetzt los!', F.big, C.accent)
  else liveRelative(parent, leave, F.big, C.ink)
  text(parent, `um ${t.leaveTime}`, F.small, C.muted)
  parent.addSpacer(small ? 4 : 6)

  if (t.line) {
    const r = hstack(parent, 5)
    symbol(r, vehicleSymbol(t.product), 13, C.accent)
    text(r, `${t.line} · ${t.depTime}`, F.time, C.ink)
    if (t.delay) text(r, `+${t.delay}`, F.time, C.late)
    if (!small) text(r, `ab ${t.from}`, F.small, C.muted)
  }
  const r2 = hstack(parent, 4)
  symbol(r2, 'mappin.and.ellipse', 11, C.muted)
  text(r2, small ? t.title : `${t.title} · ${t.startTime}`, F.small, C.muted)
}

function eventCard(parent, e, running) {
  eyebrow(parent, 'calendar', running ? 'Jetzt' : 'Gleich')
  parent.addSpacer(2)
  if (running) text(parent, `bis ${e.end}`, F.big, C.ink)
  else liveRelative(parent, at(e.startIso), F.big, C.ink)
  parent.addSpacer(2)
  text(parent, e.title, F.title, C.ink, 2)
  if (!running) text(parent, `um ${e.time}`, F.small, C.muted)
}

function mealCard(parent, f) {
  eyebrow(parent, 'fork.knife', 'Kochen')
  parent.addSpacer(2)
  if (minsUntil(f.at) <= 0) text(parent, 'Jetzt', F.big, C.accent)
  else liveRelative(parent, f.at, F.big, C.ink)
  parent.addSpacer(2)
  text(parent, f.meal.title, F.title, C.ink, 2)
}

function dayCard(parent, data) {
  const df = new DateFormatter()
  df.locale = 'de_DE'
  df.dateFormat = small ? 'EEE d. MMM' : 'EEEE, d. MMM'
  eyebrow(parent, 'sun.horizon.fill', df.string(now))
  parent.addSpacer(2)
  if (data.weather) {
    const r = hstack(parent, 6)
    symbol(r, weatherSymbol(data.weather.code, data.weather.isDay), 24, C.accent)
    text(r, `${data.weather.temp}°`, F.big, C.ink)
    text(r, `bis ${data.weather.max}°`, F.small, C.muted)
  }
  parent.addSpacer(4)
  const next = nextTimed(data)
  if (next) {
    const r = hstack(parent, 5)
    text(r, next.time, F.time, C.me)
    text(r, next.title, F.body, C.ink)
  } else {
    text(parent, 'Heute keine Termine mehr', F.small, C.muted)
  }
}

/** nächster Termin mit Uhrzeit, der noch nicht vorbei ist (steht in der Tageskarte, nicht noch mal in der Liste) */
const nextTimed = (data) => todayLeft(data).find((e) => !e.allDay)

function tomorrowCard(parent, data) {
  eyebrow(parent, 'moon.stars.fill', 'Morgen')
  parent.addSpacer(2)
  const w = data.weather && data.weather.tomorrow
  if (w) {
    const r = hstack(parent, 6)
    symbol(r, weatherSymbol(w.code, true), 22, C.accent)
    text(r, `${w.max}°`, F.big, C.ink)
    text(r, `nachts ${w.min}°`, F.small, C.muted)
  }
  parent.addSpacer(4)
  const t = data.trip
  if (t && t.leaveTime) {
    const r = hstack(parent, 5)
    symbol(r, 'figure.walk', 12, C.accent)
    text(r, `Los ${t.leaveTime}`, F.time, C.accent)
    text(r, t.title, F.body, C.ink)
    return
  }
  const first = ((data.events && data.events.tomorrow) || [])[0]
  if (first) {
    const r = hstack(parent, 5)
    text(r, first.allDay ? 'Ganztags' : first.time, F.time, C.me)
    text(r, first.title, F.body, C.ink)
  } else {
    text(parent, 'Morgen keine Termine', F.small, C.muted)
  }
}

function focusCard(parent, data, focus) {
  if (focus.kind === 'trip') tripCard(parent, focus.trip)
  else if (focus.kind === 'event') eventCard(parent, focus.event, focus.now)
  else if (focus.kind === 'meal') mealCard(parent, focus)
  else if (focus.kind === 'tomorrow') tomorrowCard(parent, data)
  else dayCard(parent, data)
}

// ───────── Liste daneben / darunter ─────────

function agendaRow(parent, timeLabel, title, timeColor = C.me) {
  const r = hstack(parent, 6)
  const t = text(r, timeLabel, F.time, timeColor)
  t.minimumScaleFactor = 0.8
  text(r, title, F.body, C.ink)
}

function agenda(parent, data, focus, maxRows) {
  let rows = 0
  const add = (fn) => {
    if (rows >= maxRows) return
    fn()
    rows++
    parent.addSpacer(4)
  }
  const evening = focus.kind === 'tomorrow'
  const events = evening ? (data.events && data.events.tomorrow) || [] : todayLeft(data)
  // was die Karte schon zeigt, nicht doppelt
  const tomorrowFirst = !(data.trip && data.trip.leaveTime) ? ((data.events && data.events.tomorrow) || [])[0] : null
  const shown = focus.kind === 'event' ? focus.event : focus.kind === 'day' ? nextTimed(data) : evening ? tomorrowFirst : null
  for (const e of events) {
    if (shown && e.title === shown.title && e.time === shown.time) continue
    const running = !evening && isRunning(e)
    add(() => agendaRow(parent, e.allDay ? 'Ganzt.' : running ? 'Jetzt' : e.time, e.title, running ? C.accent : C.me))
  }
  if (!evening && data.meal && focus.kind !== 'meal') {
    add(() => {
      const r = hstack(parent, 6)
      symbol(r, 'fork.knife', 11, C.accent)
      text(r, data.meal.time ? `${data.meal.time} ${data.meal.title}` : data.meal.title, F.body, C.ink)
    })
  }
  const todos = data.todos
  if (todos && todos.count) {
    add(() => {
      const r = hstack(parent, 6)
      symbol(r, 'checklist', 11, C.accent)
      const first = todos.items[0]
      text(r, todos.count === 1 ? first.title : `${todos.count} Todos · ${first.title}`, F.body, C.ink)
    })
    if (large) {
      for (const item of todos.items.slice(1, 5)) {
        add(() => {
          const r = hstack(parent, 6)
          text(r, '○', F.small, item.late ? C.late : C.muted)
          text(r, item.title, F.body, C.ink)
        })
      }
    }
  } else if (rows < maxRows) {
    add(() => {
      const r = hstack(parent, 6)
      symbol(r, 'checkmark.circle.fill', 11, C.ok)
      text(r, 'Keine Todos für heute', F.body, C.muted)
    })
  }
}

function footer(parent, data, stale) {
  const df = new DateFormatter()
  df.dateFormat = 'HH:mm'
  const when = df.string(data.updated ? new Date(data.updated) : now)
  text(parent, stale ? `offline · ${when}` : when, F.tiny, C.muted)
}

// ───────── Widget bauen ─────────

async function build() {
  const w = new ListWidget()
  const g = new LinearGradient()
  g.colors = [C.bgTop, C.bgBottom]
  g.locations = [0, 1]
  w.backgroundGradient = g
  w.url = APP
  w.setPadding(small ? 13 : 14, 14, 12, 14)

  const res = await load()
  if (res.error) {
    eyebrow(w, 'house.fill', 'Haushaltsboard')
    w.addSpacer(6)
    text(w, res.error === 'Link ungültig oder erneuert' ? 'Link erneuert? Code in der App neu kopieren.' : res.error, F.small, C.muted, 3)
    return w
  }
  const data = res.data
  const focus = pickFocus(data)

  // bei einem bevorstehenden Weg öfter aktualisieren (Verspätungen); der Countdown läuft ohnehin von selbst
  const soonTrip = focus.kind === 'trip' && minsUntil(at(focus.trip.leaveAt)) < 60
  w.refreshAfterDate = new Date(now.getTime() + (soonTrip ? 5 : 15) * 60 * 1000)

  if (small) {
    focusCard(w, data, focus)
    w.addSpacer()
    footer(w, data, res.stale)
    return w
  }

  if (large) {
    const card = w.addStack()
    card.layoutVertically()
    card.backgroundColor = C.card
    card.cornerRadius = 16
    card.setPadding(12, 12, 12, 12)
    const inner = vstack(card, 1)
    focusCard(inner, data, focus)
    card.addSpacer()
    w.addSpacer(12)
    eyebrow(w, focus.kind === 'tomorrow' ? 'calendar' : 'list.bullet', focus.kind === 'tomorrow' ? 'Morgen' : 'Heute noch', C.muted)
    w.addSpacer(6)
    agenda(w, data, focus, 8)
    w.addSpacer()
    footer(w, data, res.stale)
    return w
  }

  // mittel: links der Fokus als Karte, rechts was sonst noch ansteht
  const row = w.addStack()
  row.layoutHorizontally()
  row.spacing = 12
  const card = row.addStack()
  card.layoutVertically()
  card.backgroundColor = C.card
  card.cornerRadius = 16
  card.setPadding(10, 11, 10, 11)
  card.size = new Size(150, 0)
  focusCard(card, data, focus)
  card.addSpacer()

  const right = vstack(row, 0)
  right.addSpacer(2)
  agenda(right, data, focus, 4)
  right.addSpacer()
  footer(right, data, res.stale)
  return w
}

const widget = await build()
if (config.runsInWidget) {
  Script.setWidget(widget)
} else if (small) {
  await widget.presentSmall()
} else if (large) {
  await widget.presentLarge()
} else {
  await widget.presentMedium()
}
Script.complete()
