import { supabase } from '../../lib/supabase'
import type { Todo } from './useTodos'

/** Wann ein Todo dran ist: ein Tag, „diese Woche“ oder noch ohne Tag */
export type When = { kind: 'day'; date: string } | { kind: 'week' } | { kind: 'none' }

export type TodoInput = { title: string; when: When; assignee: string | null }

function whenFields(when: When) {
  return {
    due_date: when.kind === 'day' ? when.date : null,
    this_week: when.kind === 'week',
  }
}

export function whenOf(t: Todo): When {
  if (t.due_date) return { kind: 'day', date: t.due_date }
  if (t.this_week) return { kind: 'week' }
  return { kind: 'none' }
}

// Änderungen kommen per Realtime in alle offenen Listen, deshalb kein lokaler Zustand hier.
// Rückgabe: true = gespeichert.

export async function createTodo(input: TodoInput): Promise<boolean> {
  const { error } = await supabase
    .from('todos')
    .insert({ title: input.title.trim(), assignee: input.assignee, ...whenFields(input.when) })
  return !error
}

export async function updateTodo(id: string, input: TodoInput, before: Todo): Promise<boolean> {
  const fields = whenFields(input.when)
  // Neu eingeplant → „seit …“-Hinweis zurücksetzen, die Rutsch-Regel beginnt von vorn
  const replanned = fields.due_date !== before.due_date || fields.this_week !== before.this_week
  const { error } = await supabase
    .from('todos')
    .update({
      title: input.title.trim(),
      assignee: input.assignee,
      ...fields,
      ...(replanned ? { moved_since: null } : {}),
    })
    .eq('id', id)
  return !error
}

export async function deleteTodo(id: string): Promise<boolean> {
  const { error } = await supabase.from('todos').delete().eq('id', id)
  return !error
}
