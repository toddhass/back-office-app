// GENERATED FILE - do not hand-edit.
// Regenerate any time the schema changes, via the Supabase MCP tool
// generate_typescript_types.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      availability: {
        Row: {
          available_from: string | null
          available_to: string | null
          created_at: string | null
          day_of_week: number
          id: string
          is_unavailable: boolean | null
          raw_text: string | null
          staff_id: string
          week_start: string
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          created_at?: string | null
          day_of_week: number
          id?: string
          is_unavailable?: boolean | null
          raw_text?: string | null
          staff_id: string
          week_start: string
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_unavailable?: boolean | null
          raw_text?: string | null
          staff_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          barcode: string | null
          created_at: string | null
          current_stock: number | null
          embedding: string | null
          grams_per_unit: number | null
          id: string
          last_reorder_sent_at: string | null
          name: string
          par_level: number | null
          restaurant_id: string
          shelf_life_days: number | null
          sku: string | null
          unit: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string | null
          current_stock?: number | null
          embedding?: string | null
          grams_per_unit?: number | null
          id?: string
          last_reorder_sent_at?: string | null
          name: string
          par_level?: number | null
          restaurant_id: string
          shelf_life_days?: number | null
          sku?: string | null
          unit: string
        }
        Update: {
          barcode?: string | null
          created_at?: string | null
          current_stock?: number | null
          embedding?: string | null
          grams_per_unit?: number | null
          id?: string
          last_reorder_sent_at?: string | null
          name?: string
          par_level?: number | null
          restaurant_id?: string
          shelf_life_days?: number | null
          sku?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          confidence: string | null
          created_at: string | null
          id: string
          inventory_item_id: string | null
          invoice_id: string
          line_total: number | null
          match_candidates: Json | null
          needs_review: boolean | null
          po_item_id: string | null
          po_qty_applied: number | null
          quantity: number | null
          raw_description: string
          shipment_note: string | null
          sku: string | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string | null
          id?: string
          inventory_item_id?: string | null
          invoice_id: string
          line_total?: number | null
          match_candidates?: Json | null
          needs_review?: boolean | null
          po_item_id?: string | null
          po_qty_applied?: number | null
          quantity?: number | null
          raw_description: string
          shipment_note?: string | null
          sku?: string | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          confidence?: string | null
          created_at?: string | null
          id?: string
          inventory_item_id?: string | null
          invoice_id?: string
          line_total?: number | null
          match_candidates?: Json | null
          needs_review?: boolean | null
          po_item_id?: string | null
          po_qty_applied?: number | null
          quantity?: number | null
          raw_description?: string
          shipment_note?: string | null
          sku?: string | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_by_email: string | null
          created_at: string | null
          file_url: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          invoice_total: number | null
          raw_extraction: Json | null
          restaurant_id: string
          status: string | null
          supplier_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_email?: string | null
          created_at?: string | null
          file_url: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_total?: number | null
          raw_extraction?: Json | null
          restaurant_id: string
          status?: string | null
          supplier_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_by_email?: string | null
          created_at?: string | null
          file_url?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_total?: number | null
          raw_extraction?: Json | null
          restaurant_id?: string
          status?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      item_mappings: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          raw_description: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          raw_description: string
          restaurant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          raw_description?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_mappings_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_mappings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          restaurant_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          restaurant_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          inventory_item_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number | null
        }
        Insert: {
          id?: string
          inventory_item_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number | null
        }
        Update: {
          id?: string
          inventory_item_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          expected_delivery_date: string | null
          id: string
          po_number: string | null
          restaurant_id: string
          status: string | null
          supplier_id: string
        }
        Insert: {
          created_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          po_number?: string | null
          restaurant_id: string
          status?: string | null
          supplier_id: string
        }
        Update: {
          created_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          po_number?: string | null
          restaurant_id?: string
          status?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          menu_item_id: string
          notes: string | null
          quantity: number
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          menu_item_id: string
          notes?: string | null
          quantity: number
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          menu_item_id?: string
          notes?: string | null
          quantity?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_invites: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          restaurant_id: string
          role: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          restaurant_id: string
          role?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          restaurant_id?: string
          role?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string | null
          id: string
          name: string
          onboarding_completed: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          onboarding_completed?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          onboarding_completed?: boolean | null
        }
        Relationships: []
      }
      schedules: {
        Row: {
          created_at: string | null
          id: string
          restaurant_id: string
          status: string | null
          week_start: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          restaurant_id: string
          status?: string | null
          week_start: string
        }
        Update: {
          created_at?: string | null
          id?: string
          restaurant_id?: string
          status?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          schedule_id: string
          shift_name: string
          staff_id: string
          start_time: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          schedule_id: string
          shift_name: string
          staff_id: string
          start_time: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          schedule_id?: string
          shift_name?: string
          staff_id?: string
          start_time?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_requirements: {
        Row: {
          count_needed: number
          day_of_week: number
          end_time: string
          id: string
          restaurant_id: string
          role: string
          shift_name: string
          start_time: string
        }
        Insert: {
          count_needed: number
          day_of_week: number
          end_time: string
          id?: string
          restaurant_id: string
          role: string
          shift_name: string
          start_time: string
        }
        Update: {
          count_needed?: number
          day_of_week?: number
          end_time?: string
          id?: string
          restaurant_id?: string
          role?: string
          shift_name?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_requirements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string | null
          id: string
          max_hours_week: number | null
          name: string
          phone: string | null
          restaurant_id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_hours_week?: number | null
          name: string
          phone?: string | null
          restaurant_id: string
          role: string
        }
        Update: {
          created_at?: string | null
          id?: string
          max_hours_week?: number | null
          name?: string
          phone?: string | null
          restaurant_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_restaurants: {
        Row: {
          created_at: string | null
          id: string
          restaurant_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          restaurant_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          restaurant_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_restaurants_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          change: number
          created_at: string | null
          id: string
          inventory_item_id: string
          reference_id: string | null
          source: string
        }
        Insert: {
          change: number
          created_at?: string | null
          id?: string
          inventory_item_id: string
          reference_id?: string | null
          source: string
        }
        Update: {
          change?: number
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          reference_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string | null
          id: string
          name: string
          phone: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_log: {
        Row: {
          created_at: string | null
          estimated_value: number | null
          id: string
          inventory_item_id: string | null
          item_name_raw: string
          logged_by_email: string | null
          photo_url: string | null
          quantity: number
          restaurant_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          inventory_item_id?: string | null
          item_name_raw: string
          logged_by_email?: string | null
          photo_url?: string | null
          quantity: number
          restaurant_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          inventory_item_id?: string | null
          item_name_raw?: string
          logged_by_email?: string | null
          photo_url?: string | null
          quantity?: number
          restaurant_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waste_log_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_saved_log: {
        Row: {
          created_at: string | null
          estimated_value: number | null
          id: string
          inventory_item_id: string
          marked_by_email: string | null
          quantity: number
          restaurant_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          inventory_item_id: string
          marked_by_email?: string | null
          quantity: number
          restaurant_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          inventory_item_id?: string
          marked_by_email?: string | null
          quantity?: number
          restaurant_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waste_saved_log_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_saved_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      at_risk_items: {
        Args: { p_restaurant_id: string }
        Returns: {
          current_stock: number
          days_until_expiration: number
          estimated_expiration: string
          inventory_item_id: string
          last_delivered: string
          last_unit_price: number
          name: string
          shelf_life_days: number
          unit: string
        }[]
      }
      auto_create_po_if_needed: {
        Args: { p_inventory_item_id: string }
        Returns: Json
      }
      check_short_shipment:
        | {
            Args: {
              p_inventory_item_id: string
              p_invoice_qty: number
              p_supplier_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_inventory_item_id: string
              p_invoice_line_item_id?: string
              p_invoice_qty: number
              p_supplier_id: string
            }
            Returns: string
          }
      confirm_invoice_and_post: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      create_invite: {
        Args: { p_restaurant_id: string; p_role?: string }
        Returns: string
      }
      create_po_for_item_with_supplier: {
        Args: { p_inventory_item_id: string; p_supplier_id: string }
        Returns: Json
      }
      create_restaurant_and_owner: {
        Args: { p_restaurant_name: string }
        Returns: string
      }
      generate_demo_activity:
        | { Args: Record<PropertyKey, never>; Returns: undefined }
        | { Args: { p_restaurant_id?: string }; Returns: undefined }
      get_business_snapshot: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_menu_costing: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_open_po_line_for_item: {
        Args: { p_inventory_item_id: string }
        Returns: Json
      }
      get_prior_price: {
        Args: { p_exclude_line_item_id: string; p_inventory_item_id: string; p_restaurant_id: string }
        Returns: number
      }
      log_waste: {
        Args: {
          p_inventory_item_id: string | null
          p_item_name_raw: string
          p_logged_by_email: string
          p_photo_url: string | null
          p_quantity: number
          p_restaurant_id: string
          p_unit: string
        }
        Returns: Json
      }
      mark_item_used_before_waste: {
        Args: {
          p_inventory_item_id: string
          p_marked_by_email?: string
          p_quantity: number
        }
        Returns: Json
      }
      match_by_embedding: {
        Args: { p_embedding: string; p_limit: number; p_restaurant_id: string }
        Returns: {
          id: string
          name: string
          score: number
        }[]
      }
      match_by_trigram: {
        Args: { p_limit: number; p_query: string; p_restaurant_id: string }
        Returns: {
          id: string
          name: string
          score: number
        }[]
      }
      match_supplier_by_trigram: {
        Args: { p_query: string; p_restaurant_id: string }
        Returns: {
          id: string
          name: string
          score: number
        }[]
      }
      normalize_item_text: { Args: { input: string }; Returns: string }
      receive_po_item_by_barcode: {
        Args: { p_inventory_item_id: string; p_quantity: number }
        Returns: Json
      }
      redeem_invite: { Args: { p_code: string }; Returns: string }
      reopen_invoice_for_correction: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      show_limit: { Args: Record<PropertyKey, never>; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stockout_risk_items: {
        Args: { p_restaurant_id: string }
        Returns: {
          avg_daily_usage: number
          current_stock: number
          days_short: number
          expected_delivery_date: string
          inventory_item_id: string
          item_name: string
          projected_stockout_date: string
        }[]
      }
      user_restaurant_ids: { Args: Record<PropertyKey, never>; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
