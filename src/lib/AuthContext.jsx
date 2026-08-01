import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [loading, setLoading] = useState(true);

  async function loadRestaurant(userId) {
    const { data } = await supabase
      .from("staff_restaurants")
      .select("restaurant_id, restaurants(name, onboarding_completed)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (data) {
      setRestaurantId(data.restaurant_id);
      setRestaurantName(data.restaurants?.name || null);
      setOnboardingCompleted(data.restaurants?.onboarding_completed ?? true);
    } else {
      setRestaurantId(null);
      setRestaurantName(null);
      setOnboardingCompleted(true);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) loadRestaurant(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) loadRestaurant(session.user.id);
      else {
        setRestaurantId(null);
        setRestaurantName(null);
        setOnboardingCompleted(true);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function refreshRestaurant() {
    if (session?.user) await loadRestaurant(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, restaurantId, restaurantName, onboardingCompleted, loading, refreshRestaurant }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
