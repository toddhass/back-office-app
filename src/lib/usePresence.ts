import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

export interface PresentUser {
  userId: string;
  email: string;
}

// Real-time "who's using this right now", not "who has ever logged in" -
// built on Supabase's Presence system rather than a timestamp/heartbeat
// hack, since Presence already handles join/leave/sync correctly,
// including a client disconnecting without a clean logout (tab closed,
// connection dropped). Scoped per restaurant so two people on different
// restaurants under the same account never see each other's presence.
export function usePresence(restaurantId: string | null): PresentUser[] {
  const { session } = useAuth();
  const [users, setUsers] = useState<PresentUser[]>([]);

  useEffect(() => {
    if (!restaurantId || !session?.user) {
      setUsers([]);
      return;
    }

    const channel = supabase.channel(`presence-${restaurantId}`, {
      config: { presence: { key: session.user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, { email?: string }[]>;
        const list: PresentUser[] = Object.entries(state).map(([userId, metas]) => ({
          userId,
          email: metas[0]?.email || "Unknown",
        }));
        setUsers(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: session.user.email, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, session?.user?.id]);

  return users;
}
