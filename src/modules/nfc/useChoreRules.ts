import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type RuleOption = { id: string; title: string; active: boolean }

/** Putzregeln zur Auswahl beim Baustein „Putzaufgabe abhaken“ */
export function useChoreRules(): RuleOption[] {
  const [rules, setRules] = useState<RuleOption[]>([])
  useEffect(() => {
    supabase
      .from('chore_rules')
      .select('id, title, active')
      .order('title')
      .then(({ data }) => setRules(data ?? []))
  }, [])
  return rules
}
