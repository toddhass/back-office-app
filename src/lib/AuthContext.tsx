import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

const STORAGE_KEY = "back_office_current_restaurant_id";

interface Restaurant {
  id: string;
  name: string;
  onboarding_completed: boolean;
  role: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  restaurants: Restaurant[];
  restaurantId: string | null;
  restaurantName: string | null;
  onboardingCompleted: boolean;
  switchRestaurant: (id: string) => void;
  refreshRestaurant: () => Promise<void>;
}

// This default value is the actual reason the JS version cascaded so many
// "never"/"unknown" errors into every screen that calls useAuth(): with
// createContext(null), TS infers the context type as `Context<null>`,
// so restaurantId/onboardingCompleted/etc. don't exist on anything a
// screen destructures from it. Giving it a real default matching the
// shape fixes that at the source, for every consumer at once.
const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  restaurants: [],
  restaurantId: null,
  restaurantName: null,
  onboardingCompleted: true,
  switchRestaurant: () => {},
  refreshRestaurant: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadRestaurants(userId: string) {
    const { data } = await supabase
      .from("staff_restaurants")
      .select("restaurant_id, role, restaurants(name, onboarding_completed)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const list: Restaurant[] = (data || []).map((row: any) => ({
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

    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const savedStillValid = saved && list.some((r) => r.id === saved);
    setCurrentRestaurantId(savedStillValid ? saved! : list[0].id);
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

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function refreshRestaurant() {
    if (session?.user) await loadRestaurants(session.user.id);
  }

  function switchRestaurant(id: string) {
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
