// The generator correctly types these functions' Returns as `Json` -
// that's honest, since Postgres jsonb has no internal structure Postgres
// itself knows about. These narrower types are hand-authored to match
// what each function's migration actually builds with jsonb_build_object,
// kept next to (not inside) the generated file so regenerating never
// clobbers them.
//
// Real discipline this requires: whoever changes one of these SQL
// functions must remember to update the matching type here too. Nothing
// enforces that automatically - it's a manual contract, same as keeping
// a hand-written API doc in sync with the actual endpoint.

export type AutoCreatePOResult =
  | { created: true; po_number: string; supplier_name: string; item_name: string; quantity: number; unit: string }
  | { created: false; reason: "not_below_par" | "already_open" | "no_known_supplier" | "Item not found" };

export type CreatePOWithSupplierResult =
  | { created: true; po_number: string; supplier_name: string; item_name: string; quantity: number; unit: string }
  | { created: false; reason: string };

export type MarkUsedResult =
  | { logged: true; item_name: string; quantity: number; unit: string; estimated_value: number | null }
  | { logged: false; reason: string };

export type ReopenInvoiceResult = {
  reversed_items: { inventory_item_id: string; name: string; quantity_reversed: number; clamped: boolean }[];
  po_adjustments: { po_number: string; item_name: string; quantity_reversed: number }[];
};
