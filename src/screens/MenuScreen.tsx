import { useEffect, useState } from "react";
import { UtensilsCrossed, Plus, ArrowLeft, X, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import type { Tables } from "../lib/database.types";
import type { AutoCreatePOResult, CreatePOWithSupplierResult } from "../lib/rpc-types";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";

type MenuItem = Tables<"menu_items">;
type InventoryItemLite = Pick<Tables<"inventory_items">, "id" | "name" | "unit">;
type RecipeIngredient = Tables<"recipe_ingredients"> & { inventory_items: { name: string; unit: string } | null };

interface AutoPOModalState {
  tone: "success" | "info" | "pick-vendor";
  text: string;
  itemId?: string;
}

export default function MenuScreen() {
  const { restaurantId: RESTAURANT_ID } = useAuth();
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemLite[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [recipe, setRecipe] = useState<RecipeIngredient[]>([]);
  const [showAddDish, setShowAddDish] = useState(false);
  const [newDishName, setNewDishName] = useState("");
  const [newDishCategory, setNewDishCategory] = useState("");
  const [newDishPrice, setNewDishPrice] = useState("");
  const [addingDish, setAddingDish] = useState(false);
  const [showAddIngredient, setShowAddIngredient] = useState(false);

  // "existing" picks from inventoryItems via the dropdown; "new" creates a
  // brand-new inventory_items row first (e.g. salt, or anything never
  // purchased/tracked before) - real gap this closes: previously there was
  // no way to add an ingredient that wasn't already in inventory at all.
  const [ingredientMode, setIngredientMode] = useState<"existing" | "new">("existing");
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");
  const [newIngredientUnit, setNewIngredientUnit] = useState("");
  const [newIngredientNotes, setNewIngredientNotes] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemPar, setNewItemPar] = useState("");
  // Deliberately separate from newIngredientUnit: a recipe measures usage
  // per serving (e.g. "0.25 lb" of salt in a taco), but par level tracks
  // what's kept in stock, usually in a different, larger purchasing unit
  // (e.g. "lb" bags or "case"). Conflating the two into one shared "Unit"
  // field made the par level nonsensical for anything measured finely at
  // the recipe level but stocked in bulk.
  const [newItemStockUnit, setNewItemStockUnit] = useState("");
  const [addingIngredient, setAddingIngredient] = useState(false);

  const [autoPOModal, setAutoPOModal] = useState<AutoPOModalState | null>(null);
  const [vendorPickerList, setVendorPickerList] = useState<{ id: string; name: string }[]>([]);
  const [vendorPickerLoading, setVendorPickerLoading] = useState(false);

  useEffect(() => {
    load();
  }, [RESTAURANT_ID]);

  useEffect(() => {
    if (!RESTAURANT_ID) return;
    const channel = supabase
      .channel(`menu-${RESTAURANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "recipe_ingredients" }, () => {
        if (selectedItem) loadRecipe(selectedItem.id);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [RESTAURANT_ID, selectedItem]);

  async function load() {
    if (!RESTAURANT_ID) return;
    setLoading(true);
    const { data: items } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("category")
      .order("name");
    setMenuItems(items || []);

    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id, name, unit")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("name");
    setInventoryItems(inv || []);
    setLoading(false);
  }

  async function loadRecipe(menuItemId: string) {
    const { data } = await supabase
      .from("recipe_ingredients")
      .select("*, inventory_items(name, unit)")
      .eq("menu_item_id", menuItemId)
      .order("created_at");
    setRecipe(data || []);
  }

  function openDish(item: MenuItem) {
    setSelectedItem(item);
    loadRecipe(item.id);
  }

  async function addDish() {
    if (!newDishName.trim() || !RESTAURANT_ID) return;
    setAddingDish(true);
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: RESTAURANT_ID,
        name: newDishName.trim(),
        category: newDishCategory.trim() || null,
        price: newDishPrice ? Number(newDishPrice) : null,
      })
      .select()
      .single();

    if (!error && data) {
      setNewDishName("");
      setNewDishCategory("");
      setNewDishPrice("");
      setShowAddDish(false);
      load();
      openDish(data);
    }
    setAddingDish(false);
  }

  function resetIngredientForm() {
    setIngredientMode("existing");
    setNewIngredientId("");
    setNewIngredientQty("");
    setNewIngredientUnit("");
    setNewIngredientNotes("");
    setNewItemName("");
    setNewItemPar("");
    setNewItemStockUnit("");
  }

  async function addIngredient() {
    if (!newIngredientQty || !selectedItem || !RESTAURANT_ID) return;
    if (ingredientMode === "existing" && !newIngredientId) return;
    if (ingredientMode === "new" && !newItemName.trim()) return;

    setAddingIngredient(true);
    let inventoryItemId = newIngredientId;
    let justCreatedWithPar = false;

    if (ingredientMode === "new") {
      const parValue = newItemPar ? Number(newItemPar) : null;
      const { data: createdItem, error: createError } = await supabase
        .from("inventory_items")
        .insert({
          restaurant_id: RESTAURANT_ID,
          name: newItemName.trim(),
          unit: newItemStockUnit.trim() || "ea",
          current_stock: 0,
          par_level: parValue,
        })
        .select("id")
        .single();

      if (createError || !createdItem) {
        setAddingIngredient(false);
        return;
      }
      inventoryItemId = createdItem.id;
      justCreatedWithPar = parValue !== null;
    }

    await supabase.from("recipe_ingredients").insert({
      menu_item_id: selectedItem.id,
      inventory_item_id: inventoryItemId,
      quantity: Number(newIngredientQty),
      unit: newIngredientUnit.trim() || null,
      notes: newIngredientNotes.trim() || null,
    });

    setShowAddIngredient(false);
    setAddingIngredient(false);
    loadRecipe(selectedItem.id);
    load();

    // A brand-new item starts at 0 stock - if a par level was also set for
    // it right here, it's below par from the moment it exists, so run the
    // same auto-PO check used everywhere else in the app rather than
    // silently leaving it below par with no order placed.
    if (justCreatedWithPar) {
      const { data: poResult } = await supabase.rpc("auto_create_po_if_needed", { p_inventory_item_id: inventoryItemId });
      const typedResult = poResult as AutoCreatePOResult | null;
      if (typedResult?.created) {
        setAutoPOModal({ tone: "success", text: `${typedResult.po_number} created — ordered ${typedResult.quantity} ${typedResult.unit} of ${typedResult.item_name} from ${typedResult.supplier_name}.` });
      } else if (typedResult?.reason === "no_known_supplier") {
        setVendorPickerLoading(true);
        setAutoPOModal({ tone: "pick-vendor", itemId: inventoryItemId, text: "This is a new item with no supplier on file yet — who should this order go to?" });
        const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("restaurant_id", RESTAURANT_ID).order("name");
        setVendorPickerList(suppliers || []);
        setVendorPickerLoading(false);
      }
      // "already_open" and "not_below_par" need no follow-up here - a
      // brand-new item can't already have an open PO, and if this branch
      // ran at all a par was set, so "not_below_par" only fires if
      // current_stock somehow already exceeded par, an edge case not
      // worth a modal for.
    }

    resetIngredientForm();
  }

  async function assignSupplierAndCreatePO(supplierId: string) {
    if (!autoPOModal?.itemId) return;
    setVendorPickerLoading(true);
    const { data: result } = await supabase.rpc("create_po_for_item_with_supplier", {
      p_inventory_item_id: autoPOModal.itemId,
      p_supplier_id: supplierId,
    });
    const typedResult = result as CreatePOWithSupplierResult | null;
    if (typedResult?.created) {
      setAutoPOModal({ tone: "success", text: `${typedResult.po_number} created — ordered ${typedResult.quantity} ${typedResult.unit} of ${typedResult.item_name} from ${typedResult.supplier_name}.` });
    } else {
      setAutoPOModal({ tone: "info", text: "Couldn't create the order — try again from the Reorder screen." });
    }
    setVendorPickerLoading(false);
  }

  async function removeIngredient(id: string) {
    if (!selectedItem) return;
    await supabase.from("recipe_ingredients").delete().eq("id", id);
    loadRecipe(selectedItem.id);
  }

  // Grouped by category for the list view - items with no category land
  // under "Uncategorized" rather than being silently dropped.
  const grouped = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const key = item.category || "Uncategorized";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  if (selectedItem) {
    return (
      <div className="font-sans pb-6">
        {autoPOModal && (
          <Modal onClose={() => setAutoPOModal(null)} maxWidth={360}>
            <div className="text-sm text-ink leading-normal mb-4">{autoPOModal.text}</div>

            {autoPOModal.tone === "pick-vendor" && (
              <div className="flex flex-col gap-1.5 mb-3.5 max-h-[220px] overflow-y-auto">
                {vendorPickerLoading && <div className="text-sm text-slate text-center p-2">Loading…</div>}
                {!vendorPickerLoading && vendorPickerList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => assignSupplierAndCreatePO(s.id)}
                    className="w-full text-left bg-surface-alt border border-border rounded-lg px-3 py-2.5 text-ink text-sm cursor-pointer"
                  >
                    {s.name}
                  </button>
                ))}
                {!vendorPickerLoading && vendorPickerList.length === 0 && (
                  <div className="text-xs text-slate text-center p-2">No vendors on file yet — add one in Invoices → History.</div>
                )}
              </div>
            )}

            <Button
              variant={autoPOModal.tone === "pick-vendor" ? "secondary" : "primary"}
              onClick={() => setAutoPOModal(null)}
              className="w-full !text-sm"
            >
              {autoPOModal.tone === "pick-vendor" ? "None of these — skip for now" : "OK"}
            </Button>
          </Modal>
        )}

        <div className="pt-6 px-5 pb-2 flex items-center gap-3">
          <button onClick={() => setSelectedItem(null)} className="bg-transparent border-none cursor-pointer text-slate p-0">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold m-0 text-ink">{selectedItem.name}</h1>
            <div className="text-xs text-slate mt-0.5">
              {selectedItem.category || "Uncategorized"}
              {selectedItem.price != null && ` · $${Number(selectedItem.price).toFixed(2)}`}
            </div>
          </div>
        </div>

        <div className="px-4 pt-3 flex flex-col gap-2">
          <div className="text-xs uppercase tracking-wide text-slate font-semibold px-1">Recipe</div>
          {recipe.length === 0 && (
            <Card className="text-sm text-slate">No ingredients added yet.</Card>
          )}
          {recipe.map((ri) => (
            <Card key={ri.id} className="flex items-center justify-between">
              <div>
                <div className="text-sm text-ink font-medium">{ri.inventory_items?.name || "Unknown item"}</div>
                <div className="text-xs text-slate font-mono mt-0.5">
                  {ri.quantity} {ri.unit || ri.inventory_items?.unit}
                  {ri.notes && ` · ${ri.notes}`}
                </div>
              </div>
              <button onClick={() => removeIngredient(ri.id)} className="bg-transparent border-none cursor-pointer text-slate p-1">
                <Trash2 size={15} />
              </button>
            </Card>
          ))}

          <Button variant="secondary" onClick={() => setShowAddIngredient(true)} className="mt-2 flex items-center justify-center gap-1.5">
            <Plus size={15} /> Add ingredient
          </Button>
        </div>

        {showAddIngredient && (
          <Modal onClose={() => { setShowAddIngredient(false); resetIngredientForm(); }} maxWidth={340}>
            <div className="text-xs uppercase tracking-wide text-slate mb-3">Add ingredient</div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setIngredientMode("existing")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold border ${ingredientMode === "existing" ? "bg-accent text-white border-accent" : "bg-surface-alt text-slate border-border"}`}
              >
                Existing item
              </button>
              <button
                onClick={() => setIngredientMode("new")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold border ${ingredientMode === "new" ? "bg-accent text-white border-accent" : "bg-surface-alt text-slate border-border"}`}
              >
                New item
              </button>
            </div>

            {ingredientMode === "existing" ? (
              <select
                value={newIngredientId}
                onChange={(e) => {
                  setNewIngredientId(e.target.value);
                  const item = inventoryItems.find((i) => i.id === e.target.value);
                  if (item) setNewIngredientUnit(item.unit);
                }}
                className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-2"
              >
                <option value="">Select an ingredient…</option>
                {inventoryItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  placeholder="New item name — e.g. Salt"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-2"
                />
                <div className="flex gap-2 mb-1">
                  <input
                    type="number"
                    placeholder="Par level (optional)"
                    value={newItemPar}
                    onChange={(e) => setNewItemPar(e.target.value)}
                    className="flex-1 bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink"
                  />
                  <input
                    placeholder="Stock unit — e.g. lb, case"
                    value={newItemStockUnit}
                    onChange={(e) => setNewItemStockUnit(e.target.value)}
                    className="w-32 bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink"
                  />
                </div>
                <div className="text-xs text-slate mb-2 px-1">
                  How this item is stocked and reordered - can differ from how much the recipe below uses per serving.
                </div>
              </>
            )}

            <div className="text-xs uppercase tracking-wide text-slate mb-1.5 px-1">Amount used per serving</div>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                placeholder="Quantity"
                value={newIngredientQty}
                onChange={(e) => setNewIngredientQty(e.target.value)}
                className="flex-1 bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink"
              />
              <input
                placeholder="Unit"
                value={newIngredientUnit}
                onChange={(e) => setNewIngredientUnit(e.target.value)}
                className="w-24 bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink"
              />
            </div>
            <input
              placeholder="Notes (optional) — e.g. diced, garnish"
              value={newIngredientNotes}
              onChange={(e) => setNewIngredientNotes(e.target.value)}
              className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-3"
            />
            <Button
              onClick={addIngredient}
              disabled={addingIngredient || !newIngredientQty || (ingredientMode === "existing" ? !newIngredientId : !newItemName.trim())}
              className="w-full"
            >
              {addingIngredient ? "Adding…" : "Add"}
            </Button>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="font-sans pb-6">
      <div className="pt-6 px-5 pb-2 flex items-center justify-between">
        <div>
          <div className="text-xs tracking-wide uppercase text-slate mb-1 flex items-center gap-1.5">
            <UtensilsCrossed size={13} /> Menu
          </div>
          <h1 className="text-2xl font-bold m-0 tracking-tight text-ink">
            {loading ? "Loading…" : menuItems.length === 0 ? "No dishes yet" : "Your menu"}
          </h1>
        </div>
        <button
          onClick={() => setShowAddDish(true)}
          className="bg-accent border-none rounded-full w-10 h-10 flex items-center justify-center cursor-pointer"
        >
          <Plus size={20} color="#FFFFFF" />
        </button>
      </div>

      <div className="px-4 pt-3 flex flex-col gap-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className="text-xs uppercase tracking-wide text-slate font-semibold px-1 mb-1.5">{category}</div>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <button key={item.id} onClick={() => openDish(item)} className="text-left w-full">
                  <Card className="flex items-center justify-between">
                    <div className="text-sm text-ink font-medium">{item.name}</div>
                    {item.price != null && <div className="text-sm text-slate font-mono">${Number(item.price).toFixed(2)}</div>}
                  </Card>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showAddDish && (
        <Modal onClose={() => setShowAddDish(false)} maxWidth={340}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wide text-slate">Add a dish</div>
            <button onClick={() => setShowAddDish(false)} className="bg-transparent border-none cursor-pointer text-slate">
              <X size={16} />
            </button>
          </div>
          <input
            placeholder="Dish name"
            value={newDishName}
            onChange={(e) => setNewDishName(e.target.value)}
            className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-2"
          />
          <input
            placeholder="Category (optional) — e.g. Entrees"
            value={newDishCategory}
            onChange={(e) => setNewDishCategory(e.target.value)}
            className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-2"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Menu price (optional)"
            value={newDishPrice}
            onChange={(e) => setNewDishPrice(e.target.value)}
            className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-3"
          />
          <Button onClick={addDish} disabled={addingDish || !newDishName.trim()} className="w-full">
            {addingDish ? "Adding…" : "Add dish"}
          </Button>
        </Modal>
      )}
    </div>
  );
}
