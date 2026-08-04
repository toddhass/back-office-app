// Hand-written to match the live schema as of today. In a real setup this
// would be regenerated via `supabase gen types typescript` any time a
// migration changes the schema - never hand-edited long-term.

export interface Database {
  public: {
    Tables: {
      inventory_items: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          unit: string;
          current_stock: string;
          par_level: string | null;
          shelf_life_days: number | null;
          sku: string | null;
          last_reorder_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          unit: string;
          current_stock?: string;
          par_level?: string | null;
          shelf_life_days?: number | null;
          sku?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_items"]["Insert"]>;
      };

      suppliers: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          phone: string | null;
          created_at: string;
        };
        Insert: { id?: string; restaurant_id: string; name: string; phone?: string | null };
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Insert"]>;
      };

      invoices: {
        Row: {
          id: string;
          restaurant_id: string;
          supplier_id: string | null;
          file_url: string;
          invoice_number: string | null;
          invoice_date: string | null;
          invoice_total: string | null;
          status: "pending_review" | "confirmed";
          confirmed_by_email: string | null;
          confirmed_at: string | null;
          raw_extraction: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          supplier_id?: string | null;
          file_url: string;
          invoice_number?: string | null;
          invoice_date?: string | null;
          invoice_total?: string | null;
          status?: "pending_review" | "confirmed";
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
      };

      invoice_line_items: {
        Row: {
          id: string;
          invoice_id: string;
          inventory_item_id: string | null;
          raw_description: string;
          sku: string | null;
          quantity: string;
          unit: string;
          unit_price: string | null;
          line_total: string | null;
          confidence: "high" | "medium" | "low";
          needs_review: boolean;
          shipment_note: string | null;
          po_item_id: string | null;
          po_qty_applied: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["invoice_line_items"]["Row"], "id"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["invoice_line_items"]["Insert"]>;
      };

      purchase_orders: {
        Row: {
          id: string;
          restaurant_id: string;
          supplier_id: string;
          po_number: string;
          status: "sent" | "partial" | "fulfilled";
          expected_delivery_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          supplier_id: string;
          status?: "sent" | "partial" | "fulfilled";
          expected_delivery_date?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_orders"]["Insert"]>;
      };

      purchase_order_items: {
        Row: {
          id: string;
          purchase_order_id: string;
          inventory_item_id: string;
          quantity_ordered: string;
          quantity_received: string;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          inventory_item_id: string;
          quantity_ordered: string;
          quantity_received?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_order_items"]["Insert"]>;
      };

      waste_saved_log: {
        Row: {
          id: string;
          restaurant_id: string;
          inventory_item_id: string;
          quantity: string;
          unit: string | null;
          estimated_value: string | null;
          marked_by_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          inventory_item_id: string;
          quantity: string;
          unit?: string | null;
          estimated_value?: string | null;
          marked_by_email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["waste_saved_log"]["Insert"]>;
      };
    };

    Functions: {
      auto_create_po_if_needed: {
        Args: { p_inventory_item_id: string };
        Returns:
          | { created: true; po_number: string; supplier_name: string; item_name: string; quantity: number; unit: string }
          | { created: false; reason: "not_below_par" | "already_open" | "no_known_supplier" };
      };
      create_po_for_item_with_supplier: {
        Args: { p_inventory_item_id: string; p_supplier_id: string };
        Returns:
          | { created: true; po_number: string; supplier_name: string; item_name: string; quantity: number; unit: string }
          | { created: false; reason: string };
      };
      mark_item_used_before_waste: {
        Args: { p_inventory_item_id: string; p_quantity: number; p_marked_by_email: string | null };
        Returns:
          | { logged: true; item_name: string; quantity: number; unit: string; estimated_value: number | null }
          | { logged: false; reason: string };
      };
      at_risk_items: {
        Args: { p_restaurant_id: string };
        Returns: {
          inventory_item_id: string;
          name: string;
          unit: string;
          current_stock: number;
          shelf_life_days: number;
          last_delivered: string;
          estimated_expiration: string;
          days_until_expiration: number;
          last_unit_price: number | null;
        }[];
      };
      stockout_risk_items: {
        Args: { p_restaurant_id: string };
        Returns: {
          inventory_item_id: string;
          item_name: string;
          current_stock: number;
          avg_daily_usage: number;
          projected_stockout_date: string;
          expected_delivery_date: string;
          days_short: number;
        }[];
      };
      check_short_shipment: {
        Args: {
          p_supplier_id: string | null;
          p_inventory_item_id: string;
          p_invoice_qty: number;
          p_invoice_line_item_id?: string | null;
        };
        Returns: string | null;
      };
      reopen_invoice_for_correction: {
        Args: { p_invoice_id: string };
        Returns: {
          reversed_items: { inventory_item_id: string; name: string; quantity_reversed: number; clamped: boolean }[];
          po_adjustments: { po_number: string; item_name: string; quantity_reversed: number }[];
        };
      };
    };
  };
}
