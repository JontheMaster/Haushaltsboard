-- NFC-Baustein „Morgen-Briefing zeigen“ (z. B. iPhone-Automation, wenn der Fokus Schlafen endet)
alter table public.nfc_actions drop constraint nfc_actions_type_check;
alter table public.nfc_actions add constraint nfc_actions_type_check
  check (type in ('log', 'chore_done', 'todo_done', 'todo_create', 'bring_add', 'visit_toggle', 'notify', 'timer', 'night_mode', 'drive_home', 'briefing'));
