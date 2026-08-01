import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);
const STORAGE_KEY = "back_office_current_restaurant_id";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [restaurants, setRestaurants] = useState([]); // [{ id, name, onboarding_completed, role }]
  const [currentRestaurantId, setCurrentRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadRestaurants(userId) {
    const { data } = await supabase
      .from("staff_restaurants")
      .select("restaurant_id, role, restaurants(name, onboarding_completed)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const list = (data || []).map((row) => ({
      id: row.restaurant_id,
      name: row.restaurants?.name || "Untitled restaurant",
      onboarding_completed: row.restaurants?.onboarding_completed ?? true,
      role: row.role,
    }));
    setRestaurants(list);

    if (list.length === 0) {
      setCurrentRestaurantId(null);
      return;
    }

    // Prefer the last restaurant the user was actively viewing, but only
    // if they're still actually linked to it (handles someone being
    // removed from a restaurant, or the saved id being stale/invalid).
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const savedStillValid = saved && list.some((r) => r.id === saved);
    setCurrentRestaurantId(savedStillValid ? saved : list[0].id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) loadRestaurants(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) loadRestaurants(session.user.id);
      else {
        setRestaurants([]);
        setCurrentRestaurantId(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function refreshRestaurant() {
    if (session?.user) await loadRestaurants(session.user.id);
  }

  function switchRestaurant(id) {
    if (!restaurants.some((r) => r.id === id)) return;
    setCurrentRestaurantId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }

  const current = restaurants.find((r) => r.id === currentRestaurantId) || null;

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        restaurants,
        restaurantId: current?.id || null,
        restaurantName: current?.name || null,
        onboardingCompleted: current?.onboarding_completed ?? true,
        switchRestaurant,
        refreshRestaurant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
