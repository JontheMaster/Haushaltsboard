-- Putzplan: eigenes Symbol pro Regel (z. B. Pflanze fürs Gießen statt Glitzer), Entscheidung Jonathan 11.10.2026
alter table public.chore_rules add column if not exists icon text not null default 'Sparkles'
  check (icon in ('Sparkles', 'Sprout', 'Droplets', 'Trash2', 'Shirt', 'Utensils', 'Bath', 'WashingMachine', 'Recycle', 'PawPrint'));
-- vorhandene Pflanzen-Regel bekommt gleich das Pflanzen-Symbol
update public.chore_rules set icon = 'Sprout' where title ~* '(gie(ß|ss)|blume|pflanz)';
