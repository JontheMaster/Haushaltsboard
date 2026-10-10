// Haushaltsboard-Widget für Scriptable (iPhone). Wird vom kleinen Start-Skript geladen, das in Scriptable liegt
// (siehe App → Alle Funktionen → Handy-Widget). TOKEN kommt von dort. Größen: klein, mittel, groß.
// Änderungen hier wirken beim nächsten Aktualisieren des Widgets von selbst.

const API = 'https://cdfjglisfkhbkrklkxek.supabase.co/functions/v1/widget?t='
const APP = 'https://jonthemaster.github.io/Haushaltsboard/'

// Farben wie das Board (hell / dunkel)
const C = {
  bg: Color.dynamic(new Color('#F3F5F0'), new Color('#131A18')),
  card: Color.dynamic(new Color('#FFFFFF'), new Color('#1C2522')),
  ink: Color.dynamic(new Color('#1D2925'), new Color('#EEF2EC')),
  muted: Color.dynamic(new Color('#55635D'), new Color('#A2AFA8')),
  accent: Color.dynamic(new Color('#A84E1C'), new Color('#F4BE82')),
  me: Color.dynamic(new Color('#2F5D86'), new Color('#A9C7E6')),
  late: Color.dynamic(new Color('#B3412F'), new Color('#F0897A')),
}

const family = config.widgetFamily || 'medium'
const fm = FileManager.local()
const cachePath = fm.joinPath(fm.documentsDirectory(), 'haushaltsboard-daten.json')

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

// WMO-Wettercode → SF Symbol
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

function symbol(stack, name, size, color) {
  const img = stack.addImage(SFSymbol.named(name).image)
  img.imageSize = new Size(size, size)
  img.tintColor = color
  return img
}

function text(stack, value, font, color, lines = 1) {
  const t = stack.addText(value)
  t.font = font
  t.textColor = color
  t.lineLimit = lines
  return t
}

function row(parent, spacing = 6) {
  const s = parent.addStack()
  s.layoutHorizontally()
  s.centerAlignContent()
  s.spacing = spacing
  return s
}

const F = {
  title: Font.boldRoundedSystemFont(family === 'small' ? 15 : 16),
  big: Font.boldRoundedSystemFont(family === 'small' ? 17 : 18),
  body: Font.mediumRoundedSystemFont(family === 'small' ? 13 : 14),
  small: Font.mediumRoundedSystemFont(12),
  tiny: Font.regularRoundedSystemFont(10),
}

function dayHeader(w, data) {
  const head = row(w, 6)
  const df = new DateFormatter()
  df.locale = 'de_DE'
  df.dateFormat = family === 'small' ? 'EEE d.' : 'EEEE, d. MMM'
  text(head, df.string(new Date()), F.title, C.ink)
  head.addSpacer()
  if (data.weather) {
    symbol(head, weatherSymbol(data.weather.code, data.weather.isDay), 15, C.accent)
    text(head, `${data.weather.temp}°`, F.title, C.ink)
    if (family !== 'small') text(head, `bis ${data.weather.max}°`, F.small, C.muted)
  }
}

/** Termine: was heute noch kommt, sonst der erste von morgen */
function eventsBlock(w, data, max) {
  const ev = data.events
  if (!ev) {
    text(w, 'Termine gerade nicht erreichbar', F.small, C.muted)
    return
  }
  let list = ev.today.slice(0, max)
  let prefix = ''
  if (!list.length && ev.tomorrow.length) {
    list = ev.tomorrow.slice(0, Math.min(max, family === 'large' ? 3 : 1))
    prefix = 'Morgen '
  }
  if (!list.length) {
    const r = row(w)
    symbol(r, 'calendar', 13, C.muted)
    text(r, 'Heute und morgen frei', F.body, C.muted)
    return
  }
  for (const e of list) {
    const when = e.allDay ? `${prefix}Ganztags` : e.now ? `Jetzt · bis ${e.end}` : `${prefix}${e.time}`
    if (family === 'small') {
      // schmal: Uhrzeit über dem Titel, Titel darf zwei Zeilen haben
      text(w, when, F.small, e.now ? C.accent : C.me)
      text(w, e.title, F.body, C.ink, 2)
    } else {
      const r = row(w, 6)
      const tw = text(r, when, F.small, e.now ? C.accent : C.me)
      tw.minimumScaleFactor = 0.8
      text(r, e.title, F.body, C.ink)
    }
    w.addSpacer(3)
  }
}

function todosBlock(w, data, max) {
  const t = data.todos
  const head = row(w, 5)
  symbol(head, t.count ? 'checklist' : 'checkmark.circle.fill', 13, t.count ? C.accent : C.muted)
  text(head, t.count === 0 ? 'Keine Todos für heute' : t.count === 1 ? '1 Todo heute' : `${t.count} Todos heute`, F.small, t.count ? C.ink : C.muted)
  for (const item of t.items.slice(0, max)) {
    w.addSpacer(2)
    const r = row(w, 5)
    text(r, '○', F.small, item.late ? C.late : C.muted)
    text(r, item.title, F.body, C.ink)
  }
}

function mealBlock(w, data) {
  if (!data.meal) return
  const r = row(w, 5)
  symbol(r, 'fork.knife', 12, C.accent)
  text(r, data.meal.time ? `${data.meal.time} ${data.meal.title}` : data.meal.title, F.small, C.ink)
}

function footer(w, data, stale) {
  w.addSpacer()
  const df = new DateFormatter()
  df.dateFormat = 'HH:mm'
  const at = df.string(data.updated ? new Date(data.updated) : new Date())
  text(w, stale ? `Offline · Stand ${at}` : `Stand ${at}`, F.tiny, C.muted)
}

async function build() {
  const w = new ListWidget()
  w.backgroundColor = C.bg
  w.url = APP
  w.setPadding(14, 14, 12, 14)
  // iOS entscheidet selbst, wann es neu lädt; früher als nach 15 Minuten bitten wir nicht
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)

  const res = await load()
  if (res.error) {
    text(w, 'Haushaltsboard', F.title, C.ink)
    w.addSpacer(4)
    text(w, res.error === 'Link ungültig oder erneuert' ? 'Link erneuert? Skript in der App neu kopieren.' : res.error, F.small, C.muted, 3)
    return w
  }
  const data = res.data

  dayHeader(w, data)
  w.addSpacer(family === 'small' ? 6 : 8)

  if (family === 'small') {
    eventsBlock(w, data, 1)
    w.addSpacer(6)
    todosBlock(w, data, 0)
  } else if (family === 'large') {
    eventsBlock(w, data, 4)
    w.addSpacer(10)
    todosBlock(w, data, 6)
    w.addSpacer(10)
    mealBlock(w, data)
  } else {
    eventsBlock(w, data, 2)
    w.addSpacer(6)
    todosBlock(w, data, data.meal ? 1 : 2)
    if (data.meal) {
      w.addSpacer(4)
      mealBlock(w, data)
    }
  }
  footer(w, data, res.stale)
  return w
}

const widget = await build()
if (config.runsInWidget) {
  Script.setWidget(widget)
} else if (family === 'small') {
  await widget.presentSmall()
} else if (family === 'large') {
  await widget.presentLarge()
} else {
  await widget.presentMedium()
}
Script.complete()
