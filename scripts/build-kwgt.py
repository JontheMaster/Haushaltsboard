"""
KWGT-Vorlage (Android-Widget) fürs Haushaltsboard bauen: public/widget/haushaltsboard.kwgt
Eine .kwgt-Datei ist ein ZIP mit preset.json. Die Daten kommen live aus der Edge Function `widget`
(geheimer Daten-Link pro Person, in der Vorlage als Variable „link“: einmal einfügen, fertig).
Farben = Board-Design „Campfire“, Abend-Theme. Aufruf: python scripts/build-kwgt.py
"""
import json
import zipfile
from pathlib import Path

INK = '#FFEEF2EC'
MUTED = '#FFA2AFA8'
ACCENT = '#FFF4BE82'
ME = '#FFA9C7E6'
CARD = '#FF26302C'
BG = '#FF1E2824'

L = 'gv(link)'


def wg(path: str) -> str:
    """Feld aus den Widget-Daten (für Formeln innerhalb von $…$)"""
    return f'wg({L}, json, "{path}")'


def text(title: str, expr: str, size: int, color: str = INK, bold: bool = False) -> dict:
    return {
        'internal_type': 'TextModule',
        'internal_title': title,
        'text_expression': expr,
        'text_size': size,
        'text_family': 'kfile://org.kustom.provider/fonts/Roboto-Bold.ttf' if bold else 'kfile://org.kustom.provider/fonts/Roboto-Regular.ttf',
        'text_lines': 1,
        'text_size_type': 'FIXED_WIDTH',
        'text_width': 640,
        'paint_color': color,
    }


def stack(title: str, items: list, direction: str = 'VERTICAL_LEFT', margin: int = 6) -> dict:
    return {
        'internal_type': 'StackLayerModule',
        'internal_title': title,
        'config_stacking': direction,
        'config_margin': margin,
        'viewgroup_items': items,
    }


def row(title: str, label_expr: str, label_color: str, body_expr: str) -> dict:
    return stack(
        title,
        [
            {**text(f'{title} Zeit', label_expr, 26, label_color, bold=True), 'text_width': 120},
            {**text(f'{title} Text', body_expr, 26), 'text_width': 520},
        ],
        'HORIZONTAL_TOP',
        10,
    )


# ───────── Inhalt ─────────

head = stack(
    'Kopf',
    [
        text('Datum', '$df("EEEE, d. MMMM")$', 24, ACCENT, bold=True),
        text('Wetter', f'${wg(".weather.temp")}$° · bis ${wg(".weather.max")}° · nachts ${wg(".weather.min")}°', 44, INK, bold=True),
    ],
    margin=2,
)

# laufender Timer (z. B. Waschmaschine): nur wenn einer läuft
timer = text(
    'Timer',
    f'$if({wg(".timers[0].label")} != "", {wg(".timers[0].label")} + " fertig um " + {wg(".timers[0].end")}, "")$',
    26,
    ACCENT,
    bold=True,
)

events = [
    row(
        f'Termin {i + 1}',
        f'$if({wg(f".events.today[{i}].allDay")} = "true", "Ganzt.", {wg(f".events.today[{i}].time")})$',
        ME,
        f'${wg(f".events.today[{i}].title")}$',
    )
    for i in range(3)
]
no_events = text('Keine Termine', f'$if({wg(".events.today[0].title")} = "", "Heute keine Termine mehr", "")$', 24, MUTED)

todos = text(
    'Todos',
    f'$if({wg(".todos.count")} > 0, {wg(".todos.count")} + " Todos · " + {wg(".todos.items[0].title")}, "Keine Todos für heute")$',
    26,
)
shopping = text(
    'Einkauf',
    f'$if({wg(".shopping.count")} > 0, {wg(".shopping.count")} + " im Einkauf · " + {wg(".shopping.items[0]")}, "")$',
    24,
    MUTED,
)
tomorrow = text(
    'Morgen',
    f'$if({wg(".events.tomorrow[0].title")} != "", "Morgen " + {wg(".events.tomorrow[0].time")} + " " + {wg(".events.tomorrow[0].title")}, "")$',
    22,
    MUTED,
)

card = {
    'internal_type': 'OverlapLayerModule',
    'internal_title': 'Karte',
    'viewgroup_items': [
        {
            'internal_type': 'ShapeModule',
            'internal_title': 'Kartenfläche',
            'shape_type': 'RECT',
            'shape_width': 680,
            'shape_height': 300,
            'shape_corners': 36,
            'paint_color': CARD,
        },
        {**stack('Liste', [timer, *events, no_events, todos, shopping], margin=8), 'position_offset_x': 22, 'position_offset_y': 20},
    ],
}

root_items = [
    {
        'internal_type': 'ShapeModule',
        'internal_title': 'Hintergrund',
        'shape_type': 'RECT',
        'shape_width': 720,
        'shape_height': 520,
        'shape_corners': 44,
        'paint_color': BG,
    },
    {**stack('Inhalt', [head, card, tomorrow], margin=14), 'position_offset_x': 20, 'position_offset_y': 20},
]

preset = {
    'preset_info': {
        'version': 11,
        'title': 'Haushaltsboard',
        'description': 'Termine, Todos, Einkauf, Timer und Wetter aus dem Haushaltsboard. Unter Globals bei „link“ den Daten-Link einfügen.',
        'author': 'Haushaltsboard',
        'width': 720,
        'height': 520,
        'xscreens': 1,
        'yscreens': 1,
        'release': 1,
        'locked': False,
    },
    'preset_root': {
        'internal_type': 'RootLayerModule',
        'internal_title': 'Haushaltsboard',
        'background_type': 'COLOR',
        'background_color': '#00000000',
        # Variable „link“ = Daten-Link (Alle Funktionen → Handy-Widget); zwei Schlüssel, weil KWGT-Versionen sie unterschiedlich lesen
        'internal_globals': {
            'link': {
                'internal_type': 'GlobalVar',
                'internal_title': 'link',
                'global_type': 'TEXT',
                'global_default': 'HIER-DATEN-LINK-EINFUEGEN',
            }
        },
        'globals_list': {
            'link': {
                'internal_type': 'GlobalVar',
                'internal_title': 'link',
                'global_type': 'TEXT',
                'global_default': 'HIER-DATEN-LINK-EINFUEGEN',
            }
        },
        'viewgroup_items': root_items,
    },
}

out = Path(__file__).resolve().parent.parent / 'public' / 'widget' / 'haushaltsboard.kwgt'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('preset.json', json.dumps(preset, ensure_ascii=False, indent=2))
print(out, out.stat().st_size, 'Bytes')
