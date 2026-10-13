// Erzeugt aus dem Supabase-Schema (gekürzt auf das, was die App braucht).
// Nach Schemaänderungen neu erzeugen.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Rel<Fk extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Fk
  columns: [Col]
  isOneToOne: false
  referencedRelation: Ref
  referencedColumns: ['id']
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' }
  public: {
    Tables: {
      calendars: {
        Row: { color: string; hide_in_visit: boolean; id: string; label: string; owner: string | null }
        Insert: { hide_in_visit?: boolean; id: string; label: string; owner?: string | null }
        Update: { color?: string; hide_in_visit?: boolean; id?: string; label?: string; owner?: string | null }
        Relationships: [Rel<'calendars_owner_fkey', 'owner', 'members'>]
      }
      chore_rules: {
        Row: {
          active: boolean
          anchor_date: string
          assignee: string | null
          assignee_mode: string
          id: string
          rhythm: string
          show_in_today: boolean
          title: string
          weekdays: number[] | null
          placement: string
          created_at: string
          icon: string
        }
        Insert: {
          active?: boolean
          anchor_date: string
          assignee?: string | null
          assignee_mode: string
          id?: string
          rhythm: string
          show_in_today?: boolean
          title: string
          weekdays?: number[] | null
          placement?: string
          icon?: string
        }
        Update: Partial<Database['public']['Tables']['chore_rules']['Row']>
        Relationships: [Rel<'chore_rules_assignee_fkey', 'assignee', 'members'>]
      }
      chore_tasks: {
        Row: {
          assignee: string | null
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          rule_id: string
          occurs_on: string
          week_start: string
        }
        Insert: {
          assignee?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          rule_id: string
          occurs_on: string
          week_start: string
        }
        Update: Partial<Database['public']['Tables']['chore_tasks']['Row']>
        Relationships: [
          Rel<'chore_tasks_assignee_fkey', 'assignee', 'members'>,
          Rel<'chore_tasks_done_by_fkey', 'done_by', 'members'>,
          Rel<'chore_tasks_rule_id_fkey', 'rule_id', 'chore_rules'>,
        ]
      }
      fin_profiles: {
        Row: { member: string; enabled: boolean; joint_accounts: string[]; created_at: string }
        Insert: { member: string; enabled?: boolean; joint_accounts?: string[] }
        Update: { enabled?: boolean; joint_accounts?: string[] }
        Relationships: [Rel<'fin_profiles_member_fkey', 'member', 'members'>]
      }
      fin_categories: {
        Row: { id: string; name: string; icon: string; color: string; kind: 'expense' | 'income' | 'transfer'; household_default: boolean; monthly_budget: number | null; sort: number }
        Insert: { id: string; name: string; icon: string; color: string; kind?: 'expense' | 'income' | 'transfer'; household_default?: boolean; monthly_budget?: number | null; sort?: number }
        Update: { monthly_budget?: number | null; household_default?: boolean }
        Relationships: []
      }
      fin_rules: {
        Row: {
          id: string
          pattern: string
          field: 'counterparty' | 'purpose' | 'kind'
          category: string
          household: boolean | null
          owner: string | null
          hits: number
          created_from: 'seed' | 'manual'
          created_at: string
        }
        Insert: { pattern: string; field?: 'counterparty' | 'purpose' | 'kind'; category: string; household?: boolean | null; owner: string; created_from?: 'manual' }
        Update: { pattern?: string; category?: string; household?: boolean | null }
        Relationships: [Rel<'fin_rules_category_fkey', 'category', 'fin_categories'>, Rel<'fin_rules_owner_fkey', 'owner', 'members'>]
      }
      fin_transactions: {
        Row: {
          id: string
          owner: string
          booked_on: string
          /** Monat für die Auswertung (Folgemonat bei Monatsregeln, z. B. Miete am 30.) */
          budget_month: string
          booked_at: string | null
          counterparty: string
          purpose: string
          kind: string
          amount: number
          currency: string
          category: string
          household: boolean
          needs_review: boolean
          source: 'csv' | 'applepay' | 'googlepay'
          status: 'pending' | 'booked'
          wallet: string | null
          card: string | null
          account: string | null
          hash: string
          linked_id: string | null
          review_reason: string | null
          split: Json | null
          created_at: string
        }
        Insert: { owner: string; booked_on: string; counterparty: string; amount: number; hash: string; category?: string }
        Update: { category?: string; household?: boolean; needs_review?: boolean }
        Relationships: [Rel<'fin_transactions_owner_fkey', 'owner', 'members'>, Rel<'fin_transactions_category_fkey', 'category', 'fin_categories'>]
      }
      fin_holdings: {
        Row: {
          id: string
          owner: string
          isin: string
          name: string
          symbol: string | null
          quantity: number
          invested: number
          avg_buy_price: number | null
          currency: string
          household: boolean
          active: boolean
          created_at: string
        }
        Insert: { owner: string; isin: string; name: string; symbol?: string | null; household?: boolean; currency?: string; active?: boolean }
        Update: { name?: string; symbol?: string | null; household?: boolean; active?: boolean }
        Relationships: [Rel<'fin_holdings_owner_fkey', 'owner', 'members'>]
      }
      fin_holding_tx: {
        Row: {
          id: string
          holding: string
          date: string
          type: 'buy' | 'sell' | 'savings_plan' | 'dividend' | 'correction'
          quantity: number
          price: number | null
          amount: number
          source: 'manual' | 'csv' | 'plan'
          hash: string | null
          note: string | null
          target_quantity: number | null
          target_amount: number | null
          created_at: string
        }
        Insert: {
          holding: string
          date: string
          type: 'buy' | 'sell' | 'savings_plan' | 'dividend' | 'correction'
          quantity?: number
          price?: number | null
          amount?: number
          source?: 'manual' | 'csv' | 'plan'
          hash?: string | null
          note?: string | null
        }
        Update: { date?: string; quantity?: number; price?: number | null; amount?: number; note?: string | null }
        Relationships: [Rel<'fin_holding_tx_holding_fkey', 'holding', 'fin_holdings'>]
      }
      fin_savings_plans: {
        Row: { id: string; holding: string; amount: number; day_of_month: number; active: boolean; last_month: string | null; created_at: string }
        Insert: { holding: string; amount: number; day_of_month: number; active?: boolean }
        Update: { amount?: number; day_of_month?: number; active?: boolean }
        Relationships: [Rel<'fin_savings_plans_holding_fkey', 'holding', 'fin_holdings'>]
      }
      fin_quotes: {
        Row: { symbol: string; price: number; currency: string; at: string; fetched_at: string; source: string }
        Insert: { symbol: string; price: number; at: string }
        Update: Record<string, never>
        Relationships: []
      }
      fin_quotes_daily: {
        Row: { symbol: string; day: string; close: number }
        Insert: { symbol: string; day: string; close: number }
        Update: Record<string, never>
        Relationships: []
      }
      fin_goals: {
        Row: {
          id: string
          owner: string
          name: string
          target_amount: number
          source: 'depot' | 'konto' | 'beides'
          deadline: string | null
          household: boolean
          manual_amount: number
          sort: number
          created_at: string
        }
        Insert: { owner: string; name: string; target_amount: number; source?: 'depot' | 'konto' | 'beides'; deadline?: string | null; household?: boolean; manual_amount?: number }
        Update: { name?: string; target_amount?: number; source?: 'depot' | 'konto' | 'beides'; deadline?: string | null; household?: boolean; manual_amount?: number }
        Relationships: [Rel<'fin_goals_owner_fkey', 'owner', 'members'>]
      }
      fin_hints: {
        Row: { id: string; text: string; created_at: string }
        Insert: { text: string }
        Update: Record<string, never>
        Relationships: []
      }
      fin_sub_marks: {
        Row: { owner: string; sub_key: string; status: 'cancel' | 'hide'; todo: string | null; created_at: string }
        Insert: { owner?: string; sub_key: string; status: 'cancel' | 'hide'; todo?: string | null }
        Update: { status?: 'cancel' | 'hide'; todo?: string | null }
        Relationships: []
      }
      fin_month_rules: {
        Row: { id: string; label: string; pattern: string; field: 'counterparty' | 'purpose'; min_amount: number; from_day: number; created_at: string }
        Insert: { label: string; pattern: string; field?: 'counterparty' | 'purpose'; min_amount?: number; from_day?: number }
        Update: { label?: string; pattern?: string; field?: 'counterparty' | 'purpose'; min_amount?: number; from_day?: number }
        Relationships: []
      }
      fin_balances: {
        Row: { owner: string; account: string; amount: number; as_of: string; household: boolean; updated_at: string }
        Insert: { owner: string; account: string; amount: number; as_of: string; household?: boolean }
        Update: { amount?: number; as_of?: string; household?: boolean }
        Relationships: []
      }
      fin_names: {
        Row: { counterparty: string; label: string; updated_at: string }
        Insert: { counterparty: string; label: string; updated_at?: string }
        Update: { label?: string; updated_at?: string }
        Relationships: []
      }
      weather_radar: {
        Row: { id: number; fetched_at: string; first_at: string; now_at: string; step_min: number; width: number; height: number; frame_count: number; frames: string; home_x: number | null; home_y: number | null; nowcast: Json | null }
        Insert: { id: number; fetched_at: string; first_at: string; now_at: string; step_min?: number; width: number; height: number; frame_count: number; frames: string; home_x?: number | null; home_y?: number | null; nowcast?: Json | null }
        Update: Record<string, never>
        Relationships: []
      }
      fin_imports: {
        Row: { id: string; owner: string; file_name: string | null; account: string | null; from: string | null; to: string | null; rows_total: number; rows_new: number; rows_duplicate: number; at: string }
        Insert: { owner: string }
        Update: Record<string, never>
        Relationships: [Rel<'fin_imports_owner_fkey', 'owner', 'members'>]
      }
      drives: {
        Row: {
          arrived_at: string | null
          cancelled_at: string | null
          checked_at: string
          delay_s: number
          eta: string
          id: string
          jams: Json
          length_m: number
          member: string
          origin_label: string | null
          progress: number
          route: Json
          started_at: string
        }
        Insert: { member: string; eta: string; length_m: number; route?: Json; progress?: number; delay_s?: number }
        Update: { cancelled_at?: string | null; arrived_at?: string | null }
        Relationships: [Rel<'drives_member_fkey', 'member', 'members'>]
      }
      layouts: {
        Row: { device: string | null; id: string; member: string | null; tiles: Json; hidden_headers: string[] }
        Insert: { device?: string | null; id?: string; member?: string | null; tiles?: Json; hidden_headers?: string[] }
        Update: { device?: string | null; id?: string; member?: string | null; tiles?: Json; hidden_headers?: string[] }
        Relationships: [Rel<'layouts_member_fkey', 'member', 'members'>]
      }
      widget_tokens: {
        Row: { member_id: string; token: string; created_at: string }
        Insert: { member_id: string; token?: string; created_at?: string }
        Update: { member_id?: string; token?: string; created_at?: string }
        Relationships: [Rel<'widget_tokens_member_id_fkey', 'member_id', 'members'>]
      }
      member_tokens: {
        Row: { created_at: string; id: string; label: string; last_used_at: string | null; member: string; revoked: boolean; token_hash: string }
        Insert: { label: string; member: string; token_hash: string; revoked?: boolean }
        Update: { label?: string; revoked?: boolean }
        Relationships: [Rel<'member_tokens_member_fkey', 'member', 'members'>]
      }
      members: {
        Row: { color: string; id: string; is_board: boolean; name: string }
        Insert: { color: string; id: string; is_board?: boolean; name: string }
        Update: { color?: string; id?: string; is_board?: boolean; name?: string }
        Relationships: []
      }
      modules: {
        Row: { config: Json; enabled: boolean; id: string }
        Insert: { config?: Json; enabled?: boolean; id: string }
        Update: { config?: Json; enabled?: boolean; id?: string }
        Relationships: []
      }
      nfc_actions: {
        Row: {
          category: string
          created_at: string
          enabled: boolean
          icon: string
          id: string
          label: string
          owner: string | null
          params: Json
          points: number
          private: boolean
          slug: string
          type: string
        }
        Insert: {
          category?: string
          enabled?: boolean
          icon?: string
          label: string
          owner?: string | null
          params?: Json
          points?: number
          private?: boolean
          slug: string
          type: string
        }
        Update: Partial<Database['public']['Tables']['nfc_actions']['Insert']>
        Relationships: [Rel<'nfc_actions_owner_fkey', 'owner', 'members'>]
      }
      nfc_events: {
        Row: { action: string; action_id: string | null; at: string; id: string; member: string | null; message: string; ok: boolean; private: boolean }
        Insert: { action: string; action_id?: string | null; member?: string | null; message?: string; ok: boolean; private?: boolean }
        Update: Partial<Database['public']['Tables']['nfc_events']['Insert']>
        Relationships: [Rel<'nfc_events_member_fkey', 'member', 'members'>]
      }
      photos: {
        Row: {
          id: string
          path: string
          thumb_path: string
          width: number | null
          height: number | null
          uploaded_by: string | null
          taken_at: string | null
          created_at: string
          show_in_visit: boolean
          active: boolean
        }
        Insert: {
          id?: string
          path: string
          thumb_path: string
          width?: number | null
          height?: number | null
          uploaded_by?: string | null
          taken_at?: string | null
          created_at?: string
          show_in_visit?: boolean
          active?: boolean
        }
        Update: Partial<Database['public']['Tables']['photos']['Row']>
        Relationships: [Rel<'photos_uploaded_by_fkey', 'uploaded_by', 'members'>]
      }
      recipe_categories: {
        Row: { id: string; name: string; sort: number; created_at: string }
        Insert: { id?: string; name: string; sort?: number }
        Update: { name?: string; sort?: number }
        Relationships: []
      }
      recipes: {
        Row: {
          id: string
          title: string
          image_path: string | null
          thumb_path: string | null
          duration_min: number | null
          servings: number
          category_ids: string[]
          ingredients: Json
          steps: Json
          source_url: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          image_path?: string | null
          thumb_path?: string | null
          duration_min?: number | null
          servings?: number
          category_ids?: string[]
          ingredients?: Json
          steps?: Json
          source_url?: string | null
          created_by?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['recipes']['Insert']>
        Relationships: [Rel<'recipes_created_by_fkey', 'created_by', 'members'>]
      }
      meals: {
        Row: {
          id: string
          recipe_id: string | null
          title: string
          day: string
          start_time: string | null
          duration_min: number | null
          servings: number
          created_by: string | null
          created_at: string
          dismissed_at: string | null
        }
        Insert: {
          id?: string
          dismissed_at?: string | null
          recipe_id?: string | null
          title: string
          day: string
          start_time?: string | null
          duration_min?: number | null
          servings?: number
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['meals']['Insert']>
        Relationships: [Rel<'meals_recipe_id_fkey', 'recipe_id', 'recipes'>, Rel<'meals_created_by_fkey', 'created_by', 'members'>]
      }
      settings: {
        Row: { id: number; night_from: string; night_to: string; visit_mode: boolean; night_forced_until: string | null }
        Insert: { id?: number; night_from?: string; night_to?: string; visit_mode?: boolean }
        Update: { id?: number; night_from?: string; night_to?: string; visit_mode?: boolean; night_forced_until?: string | null }
        Relationships: []
      }
      push_subscriptions: {
        Row: { auth: string; created_at: string; device: string | null; endpoint: string; id: string; member_id: string; p256dh: string }
        Insert: { auth: string; device?: string | null; endpoint: string; member_id: string; p256dh: string }
        Update: { auth?: string; device?: string | null; endpoint?: string; p256dh?: string }
        Relationships: [Rel<'push_subscriptions_member_id_fkey', 'member_id', 'members'>]
      }
      transit_places: {
        Row: {
          address: string
          buffer_min: number
          created_at: string
          late_ok_min: number
          id: string
          keywords: string[]
          lat: number
          lon: number
          member_id: string | null
          name: string
          transit: boolean
          weekdays: number[]
        }
        Insert: {
          address: string
          buffer_min?: number
          id?: string
          late_ok_min?: number
          keywords?: string[]
          lat: number
          lon: number
          member_id?: string | null
          name: string
          transit?: boolean
          weekdays?: number[]
        }
        Update: Partial<Database['public']['Tables']['transit_places']['Insert']>
        Relationships: [Rel<'transit_places_member_id_fkey', 'member_id', 'members'>]
      }
      transit_prefs: {
        Row: {
          ignore: string[]
          leave_days: number[]
          leave_time: string | null
          member_id: string
          push_delay: boolean
          push_leave: boolean
          push_leave_min: number
          show_on_wall: boolean
        }
        Insert: {
          ignore?: string[]
          leave_days?: number[]
          leave_time?: string | null
          member_id: string
          push_delay?: boolean
          push_leave?: boolean
          push_leave_min?: number
          show_on_wall?: boolean
        }
        Update: Partial<Database['public']['Tables']['transit_prefs']['Insert']>
        Relationships: [Rel<'transit_prefs_member_id_fkey', 'member_id', 'members'>]
      }
      timers: {
        Row: {
          action_id: string | null
          cancelled_at: string | null
          done_text: string
          ends_at: string
          finished_at: string | null
          icon: string
          id: string
          label: string
          started_at: string
          started_by: string | null
          todo_title: string | null
        }
        Insert: { ends_at: string; label: string; icon?: string; started_at?: string; started_by?: string | null; action_id?: string | null; done_text?: string; todo_title?: string | null }
        Update: { cancelled_at?: string | null; finished_at?: string | null }
        Relationships: [Rel<'timers_started_by_fkey', 'started_by', 'members'>]
      }
      todos: {
        Row: {
          assignee: string | null
          created_at: string
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          moved_since: string | null
          reminded_at: string | null
          remind_at: string | null
          this_week: boolean
          title: string
          urgent: boolean
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          moved_since?: string | null
          reminded_at?: string | null
          remind_at?: string | null
          this_week?: boolean
          title: string
          urgent?: boolean
        }
        Update: Partial<Database['public']['Tables']['todos']['Row']>
        Relationships: [
          Rel<'todos_assignee_fkey', 'assignee', 'members'>,
          Rel<'todos_done_by_fkey', 'done_by', 'members'>,
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      // Wochenrückblick (Mo–So), ohne Datum die laufende Woche
      week_recap: { Args: { p_week_start?: string }; Returns: Json }
      // Depot: Stand der Bank als Anker setzen, Wertpapierkäufe aus dem Giro-Export zuordnen
      fin_depot_snapshot: { Args: { p_holding: string; p_quantity: number; p_invested: number; p_day: string }; Returns: undefined }
      fin_link_giro_buys: { Args: { p_owner: string }; Returns: number }
      // Depot-Auswertung (security invoker)
      fin_depot_history: { Args: { p_from?: string }; Returns: { day: string; value: number; invested: number }[] }
      fin_savings_rate: { Args: { p_months?: number }; Returns: { month: string; saved: number; income: number }[] }
      // Wand: nur Prozent und Ziel-Fortschritt gemeinsamer Depots (security definer)
      fin_wall_summary: { Args: Record<string, never>; Returns: Json }
      // Stufe 3: Monat, Verlauf, Wann, Wo, Budgets (eigene + Haushalt; Tablet nur Haushalt)
      fin_review_list: { Args: Record<string, never>; Returns: Json }
      fin_review_assign: { Args: { p_id: string; p_category: string; p_always?: boolean }; Returns: number }
      fin_overview: { Args: { p_month?: string; p_household_only?: boolean }; Returns: Json }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
