-- NFC-Baustein „Nachtmodus an“ (früher ins Bett): Nachtmodus schon jetzt, bis zum nächsten Ende (settings.night_to)
alter table public.settings add column if not exists night_forced_until timestamptz;

alter table public.nfc_actions drop constraint nfc_actions_type_check;
alter table public.nfc_actions add constraint nfc_actions_type_check
  check (type in ('log', 'chore_done', 'todo_done', 'todo_create', 'bring_add', 'visit_toggle', 'notify', 'timer', 'night_mode'));
