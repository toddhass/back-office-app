import { useEffect, useState } from "react";
import { UtensilsCrossed, Plus, ArrowLeft, X, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import type { Tables } from "../lib/database.types";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";

type MenuItem = Tables<"menu_items">;
type InventoryItemLite = Pick<Tables<"inventory_items">, "id" | "name" | "unit">;
type RecipeIngredient = Tables<"recipe_ingredients"> & { inventory_items: { name: string; unit: string } | null };

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
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newIngredientQty, setNewIngredientQty] = useState("");
  const [newIngredientUnit, setNewIngredientUnit] = useState("");
  const [newIngredientNotes, setNewIngredientNotes] = useState("");
  const [addingIngredient, setAddingIngredient] = useState(false);

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

  async function addIngredient() {
    if (!newIngredientId || !newIngredientQty || !selectedItem) return;
    setAddingIngredient(true);
    await supabase.from("recipe_ingredients").insert({
      menu_item_id: selectedItem.id,
      inventory_item_id: newIngredientId,
      quantity: Number(newIngredientQty),
      unit: newIngredientUnit.trim() || null,
      notes: newIngredientNotes.trim() || null,
    });
    setNewIngredientId("");
    setNewIngredientQty("");
    setNewIngredientUnit("");
    setNewIngredientNotes("");
    setShowAddIngredient(false);
    setAddingIngredient(false);
    loadRecipe(selectedItem.id);
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
          <Modal onClose={() => setShowAddIngredient(false)} maxWidth={340}>
            <div className="text-xs uppercase tracking-wide text-slate mb-3">Add ingredient</div>
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
            <Button onClick={addIngredient} disabled={addingIngredient || !newIngredientId || !newIngredientQty} className="w-full">
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
