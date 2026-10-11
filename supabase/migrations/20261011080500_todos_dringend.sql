-- Todos: „Dringend“ (Schalter im Formular, Symbol und ganz oben in der Liste)
alter table public.todos add column if not exists urgent boolean not null default false;
