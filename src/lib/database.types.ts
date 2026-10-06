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
      layouts: {
        Row: { device: string | null; id: string; member: string | null; tiles: Json }
        Insert: { device?: string | null; id?: string; member?: string | null; tiles?: Json }
        Update: { device?: string | null; id?: string; member?: string | null; tiles?: Json }
        Relationships: [Rel<'layouts_member_fkey', 'member', 'members'>]
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
      settings: {
        Row: { id: number; night_from: string; night_to: string; visit_mode: boolean }
        Insert: { id?: number; night_from?: string; night_to?: string; visit_mode?: boolean }
        Update: { id?: number; night_from?: string; night_to?: string; visit_mode?: boolean }
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
        Row: { ignore: string[]; member_id: string; push_delay: boolean; push_leave: boolean; push_leave_min: number; show_on_wall: boolean }
        Insert: { ignore?: string[]; member_id: string; push_delay?: boolean; push_leave?: boolean; push_leave_min?: number; show_on_wall?: boolean }
        Update: Partial<Database['public']['Tables']['transit_prefs']['Insert']>
        Relationships: [Rel<'transit_prefs_member_id_fkey', 'member_id', 'members'>]
      }
      transit_shifts: {
        Row: { id: string; member_id: string; name: string; place_id: string; start_time: string }
        Insert: { id?: string; member_id: string; name: string; place_id: string; start_time: string }
        Update: Partial<Database['public']['Tables']['transit_shifts']['Insert']>
        Relationships: [Rel<'transit_shifts_member_id_fkey', 'member_id', 'members'>, Rel<'transit_shifts_place_id_fkey', 'place_id', 'transit_places'>]
      }
      transit_shift_days: {
        Row: { day: string; member_id: string; shift_id: string }
        Insert: { day: string; member_id: string; shift_id: string }
        Update: Partial<Database['public']['Tables']['transit_shift_days']['Insert']>
        Relationships: [Rel<'transit_shift_days_member_id_fkey', 'member_id', 'members'>, Rel<'transit_shift_days_shift_id_fkey', 'shift_id', 'transit_shifts'>]
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
        }
        Update: Partial<Database['public']['Tables']['todos']['Row']>
        Relationships: [
          Rel<'todos_assignee_fkey', 'assignee', 'members'>,
          Rel<'todos_done_by_fkey', 'done_by', 'members'>,
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
