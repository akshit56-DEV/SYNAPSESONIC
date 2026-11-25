import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Concept } from "@/components/decks";
import type { ForgedSynapse } from "@/components/study-terrarium";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export interface RemoteDeckRow {
  id: string;
  user_id: string;
  title: string;
  nodes: Concept[];
  edges: ForgedSynapse[];
  updated_at: string;
}

export interface UpsertDeckInput {
  id: string;
  title: string;
  nodes: Concept[];
  edges: ForgedSynapse[];
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!supabase) {
    return {
      error:
        "Cloud sync is not configured yet (missing Supabase environment variables).",
    };
  }
  if (typeof window === "undefined") {
    return { error: "Google sign-in must be started in the browser." };
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/workspace`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    if (error) {
      return { error: error.message || "Unable to start Google sign-in." };
    }
    return { error: null };
  } catch {
    return { error: "Unable to connect to Google authentication." };
  }
}

export async function signOut(): Promise<{ error: string | null }> {
  if (!supabase) return { error: null };
  try {
    const { error } = await supabase.auth.signOut();
    return { error: error ? error.message : null };
  } catch {
    return { error: "Failed to sign out." };
  }
}

export async function sendEmailOtp(
  email: string
): Promise<{ error: string | null }> {
  if (!supabase) {
    return {
      error:
        "Cloud sync is not configured yet (missing Supabase environment variables).",
    };
  }
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    return { error: "Please enter a valid email address." };
  }
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) {
      return { error: error.message || "Unable to send login code." };
    }
    return { error: null };
  } catch {
    return { error: "Unable to send login code right now. Please try again." };
  }
}

export async function verifyEmailOtp(
  email: string,
  token: string
): Promise<{
  data: Awaited<
    ReturnType<NonNullable<typeof supabase>["auth"]["verifyOtp"]>
  >["data"] | null;
  error: string | null;
}> {
  if (!supabase) {
    return {
      data: null,
      error:
        "Cloud sync is not configured yet (missing Supabase environment variables).",
    };
  }
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: "email",
    });
    if (error) {
      return {
        data: null,
        error: error.message || "Invalid or expired 6-digit code.",
      };
    }
    return { data: data ?? null, error: null };
  } catch {
    return {
      data: null,
      error: "Unable to verify code right now. Please try again.",
    };
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

export async function fetchUserDecks(
  userId: string
): Promise<{ data: RemoteDeckRow[]; error: string | null }> {
  if (!supabase || !userId) {
    return { data: [], error: null };
  }
  try {
    const { data, error } = await supabase
      .from("study_decks")
      .select("id, user_id, title, nodes, edges, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    const rows = Array.isArray(data) ? (data as RemoteDeckRow[]) : [];
    return { data: rows, error: null };
  } catch {
    return { data: [], error: "Unable to load synced decks." };
  }
}

export async function upsertUserDeck(
  userId: string,
  deck: UpsertDeckInput
): Promise<{ error: string | null }> {
  if (!supabase || !userId) {
    return { error: null };
  }
  try {
    const payload = {
      id: deck.id,
      user_id: userId,
      title: deck.title,
      nodes: deck.nodes,
      edges: deck.edges,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("study_decks")
      .upsert(payload, { onConflict: "user_id,id" });

    return { error: error ? error.message : null };
  } catch {
    return { error: "Unable to save deck to cloud." };
  }
}

export async function deleteUserDeck(
  userId: string,
  deckId: string
): Promise<{ error: string | null }> {
  if (!supabase || !userId || !deckId) {
    return { error: null };
  }
  try {
    const { error } = await supabase
      .from("study_decks")
      .delete()
      .eq("user_id", userId)
      .eq("id", deckId);

    return { error: error ? error.message : null };
  } catch {
    return { error: "Unable to delete deck from cloud." };
  }
}
