import { supabase } from "@/lib/supabase";

export type StudyField =
  | "CS & AI"
  | "Engineering & Physics"
  | "Medicine & Bio"
  | "Business & Law"
  | "Exam Prep";

export type StudyGoal =
  | "Ace an upcoming exam"
  | "Break down dense PDFs"
  | "Build long-term recall";

export type TutorStyle =
  | "Concise & Direct"
  | "Analogy-First"
  | "Deep First-Principles";

export type PreferredStart = "micu" | "terrarium" | "ar" | "upload";

export interface UserStudyProfile {
  name: string;
  field: StudyField;
  goal: StudyGoal;
  tutorStyle: TutorStyle;
  preferredStart: PreferredStart;
  onboardingCompleted: boolean;
  tourCompleted: boolean;
}

export const STUDY_FIELDS: readonly StudyField[] = [
  "CS & AI",
  "Engineering & Physics",
  "Medicine & Bio",
  "Business & Law",
  "Exam Prep",
];

export const STUDY_GOALS: readonly StudyGoal[] = [
  "Ace an upcoming exam",
  "Break down dense PDFs",
  "Build long-term recall",
];

export const TUTOR_STYLES: readonly TutorStyle[] = [
  "Concise & Direct",
  "Analogy-First",
  "Deep First-Principles",
];

export const DEFAULT_USER_PROFILE: UserStudyProfile = {
  name: "",
  field: "CS & AI",
  goal: "Build long-term recall",
  tutorStyle: "Analogy-First",
  preferredStart: "micu",
  onboardingCompleted: false,
  tourCompleted: false,
};

function getProfileStorageKey(userId?: string | null): string {
  return userId ? `synapsesonic_profile_${userId}` : "synapsesonic_profile_guest";
}

export function loadLocalProfile(
  userId?: string | null
): UserStudyProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getProfileStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserStudyProfile>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...DEFAULT_USER_PROFILE,
      ...parsed,
      name: typeof parsed.name === "string" ? parsed.name : "",
      onboardingCompleted: Boolean(parsed.onboardingCompleted),
      tourCompleted: Boolean(parsed.tourCompleted),
    };
  } catch {
    return null;
  }
}

export function saveLocalProfile(
  profile: UserStudyProfile,
  userId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getProfileStorageKey(userId),
      JSON.stringify(profile)
    );
  } catch {
    // Quiet storage fallback
  }
}

export async function syncProfileToSupabase(
  profile: UserStudyProfile
): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.auth.updateUser({
      data: { synapse_profile: profile },
    });
  } catch {
    // Swallow transient auth/network errors gracefully without console.error
  }
}
