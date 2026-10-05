/* @ds-bundle: {"format":4,"namespace":"Board","components":[{"name":"Icon"},{"name":"Button"},{"name":"Tile"},{"name":"TaskItem"},{"name":"PersonChip"},{"name":"EventPill"},{"name":"ClockWeather"},{"name":"Toggle"},{"name":"Badge"},{"name":"ModuleCard"}]} */
(function () {
  var R = window.React, h = R.createElement, useState = R.useState, useEffect = R.useEffect;
  var ICONS = __ICONS__;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function omit(p, keys) { var o = {}; for (var k in p) { if (keys.indexOf(k) < 0) o[k] = p[k]; } return o; }

  function Icon(p) {
    var nodes = ICONS[p.name] || [], s = p.size || 24;
    return h('svg', { className: cx('hb-icon', p.className), width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: p.strokeWidth || 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', role: p.label ? 'img' : undefined, 'aria-label': p.label, 'aria-hidden': p.label ? undefined : 'true' },
      nodes.map(function (n, i) { return h(n[0], Object.assign({ key: i }, n[1])); }));
  }

  function Button(p) {
    var v = p.variant || 'quiet', lg = p.size === 'lg';
    return h('button', Object.assign({ type: 'button' }, omit(p, ['variant', 'icon', 'size', 'children', 'className']), { className: cx('hb-btn', 'hb-btn-' + v, lg && 'hb-btn-lg', p.className) }),
      p.icon && h(Icon, { name: p.icon, size: lg ? 22 : 18 }), p.children != null && h('span', null, p.children));
  }

  function Tile(p) {
    return h('section', { className: cx('hb-tile', 'hb-tile-' + (p.size || 'm'), p.editing && 'hb-tile-editing', p.lifted && 'is-lifted', p.className), style: { animationDelay: (p.delay || 0) + 'ms' }, 'aria-label': p.title },
      h('header', { className: 'hb-tile-head' },
        p.editing && h('span', { className: 'hb-grip', title: 'Verschieben' }, h(Icon, { name: 'grip-vertical', size: 18 })),
        p.icon && h('span', { className: 'hb-tile-icon' }, h(Icon, { name: p.icon, size: 20 })),
        h('h2', { className: 'hb-tile-title' }, p.title),
        p.action && h('div', null, p.action)),
      h('div', { className: 'hb-tile-body' }, p.children),
      p.editing && h('span', { className: 'hb-resize', title: 'Größe ändern', 'aria-hidden': 'true' }));
  }

  function TaskItem(p) {
    var controlled = p.done !== undefined, st = useState(!!p.defaultDone);
    var done = controlled ? p.done : st[0];
    function toggle() { var n = !done; if (!controlled) st[1](n); if (p.onToggle) p.onToggle(n); }
    return h('div', { className: cx('hb-task', done && 'is-done', p.urgent && !done && 'is-urgent', p.person && 'hb-person-' + p.person, p.compact && 'hb-compact') },
      h('button', { type: 'button', className: 'hb-check', role: 'checkbox', 'aria-checked': done ? 'true' : 'false', 'aria-label': (done ? 'Wieder öffnen: ' : 'Abhaken: ') + p.label, onClick: toggle },
        h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
          h('circle', { className: 'hb-check-ring', cx: 12, cy: 12, r: 10.5 }),
          h('circle', { className: 'hb-check-fill', cx: 12, cy: 12, r: 11 }),
          h('path', { className: 'hb-check-mark', d: 'M7.5 12.5l3 3 6-6.5' }))),
      h('span', { className: 'hb-task-label' }, p.label),
      p.urgent && !done && h('span', { className: 'hb-task-urgent' }, 'Dringend'),
      p.meta && !done && h('span', { className: 'hb-task-meta' }, p.meta),
      done && !p.hideUndo && h('button', { type: 'button', className: 'hb-undo', onClick: toggle }, h(Icon, { name: 'undo-2', size: 16 }), 'Rückgängig'));
  }

  function PersonChip(p) {
    var who = p.person || 'open', name = p.name || (who === 'a' ? 'Jonathan' : who === 'b' ? 'Sie' : 'Offen');
    return h('span', { className: cx('hb-person', 'hb-person-' + who) },
      h('span', { className: 'hb-avatar', 'aria-hidden': 'true' }, p.initial || name.charAt(0)), !p.avatarOnly && h('span', null, name));
  }

  function EventPill(p) {
    return h('div', { className: cx('hb-event', 'hb-person-' + (p.person || 'a'), p.next && 'is-next'), style: { animationDelay: (p.delay || 0) + 'ms' } },
      h('span', { className: 'hb-event-time' }, p.allDay ? 'Ganztags' : p.time),
      h('span', { className: 'hb-event-title' }, p.title));
  }

  var DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ClockWeather(p) {
    var st = useState(function () { return new Date(); }), now = st[0];
    useEffect(function () { if (p.time) return; var t = setInterval(function () { st[1](new Date()); }, 1000); return function () { clearInterval(t); }; }, [p.time]);
    var hh = p.time ? p.time.split(':')[0] : pad(now.getHours()), mm = p.time ? p.time.split(':')[1] : pad(now.getMinutes());
    var date = p.date || (DAYS[now.getDay()] + ', ' + now.getDate() + '. ' + MONTHS[now.getMonth()]);
    var w = p.weather;
    return h('div', { className: 'hb-clock' },
      h('div', { className: 'hb-clock-time', role: 'timer', 'aria-label': hh + ':' + mm + ' Uhr' },
        h('span', { key: 'h' + hh, className: 'hb-roll' }, hh), h('span', { className: 'hb-clock-colon', 'aria-hidden': 'true' }, ':'), h('span', { key: 'm' + mm, className: 'hb-roll' }, mm)),
      h('div', { className: 'hb-clock-meta' },
        h('div', { className: 'hb-clock-date' }, date),
        w && h('div', { className: 'hb-weather' },
          h('span', { className: 'hb-weather-now' }, h(Icon, { name: w.icon || 'sun', size: 26, label: w.label }), w.temp + '°'),
          (w.days || []).map(function (d, i) { return h('span', { key: i, className: 'hb-weather-day' }, d.day, ' ', h(Icon, { name: d.icon, size: 18 }), d.temp + '°'); }))));
  }

  function Toggle(p) {
    var controlled = p.checked !== undefined, st = useState(!!p.defaultChecked);
    var on = controlled ? p.checked : st[0];
    function flip() { var n = !on; if (!controlled) st[1](n); if (p.onChange) p.onChange(n); }
    var sw = h('button', { type: 'button', role: 'switch', className: 'hb-toggle', 'aria-checked': on ? 'true' : 'false', 'aria-label': p.label, onClick: flip }, h('span', { className: 'hb-toggle-knob' }));
    return p.label && !p.hideLabel ? h('label', { className: 'hb-toggle-row' }, h('span', null, p.label), sw) : sw;
  }

  function Badge(p) {
    return h('span', { className: cx('hb-badge', p.tone && 'hb-badge-' + p.tone) }, p.icon && h(Icon, { name: p.icon, size: 14 }), p.children);
  }

  function ModuleCard(p) {
    var controlled = p.enabled !== undefined, st = useState(p.defaultEnabled !== false);
    var on = controlled ? p.enabled : st[0];
    return h('div', { className: cx('hb-module', on && 'is-on') },
      h('button', { type: 'button', className: 'hb-module-open', onClick: p.onOpen },
        h('span', { className: 'hb-module-icon' }, h(Icon, { name: p.icon, size: 24 })),
        h('span', { className: 'hb-module-title' }, p.title)),
      h('div', { className: 'hb-module-foot' },
        h('span', { className: 'hb-module-status' }, p.status || (on ? 'An' : 'Aus')),
        h('button', { type: 'button', className: 'hb-icon-btn', 'aria-label': 'Einstellungen ' + p.title, onClick: p.onSettings }, h(Icon, { name: 'settings', size: 20, className: 'hb-icon-spin' })),
        h(Toggle, { checked: on, label: p.title + ' an oder aus', hideLabel: true, onChange: function (n) { if (!controlled) st[1](n); if (p.onToggle) p.onToggle(n); } })));
  }

  var api = { Icon: Icon, Button: Button, Tile: Tile, TaskItem: TaskItem, PersonChip: PersonChip, EventPill: EventPill, ClockWeather: ClockWeather, Toggle: Toggle, Badge: Badge, ModuleCard: ModuleCard, iconNames: Object.keys(ICONS) };
  window.Board = Object.assign(window.Board || {}, api);
})();
