export type SpecialtyVocab = {
  homeTitle: string;
  roleWord: string; // Coach / Guide
  clientWord: string; // clients / students
  sessionWord: string; // workout / practice
  emoji: string;
};

export const specialtyVocab: Record<string, SpecialtyVocab> = {
  fitness: { homeTitle: "COACH HQ", roleWord: "Coach", clientWord: "clients", sessionWord: "workout", emoji: "💪" },
  yoga: { homeTitle: "GUIDE STUDIO", roleWord: "Guide", clientWord: "students", sessionWord: "practice", emoji: "🧘" },
  breathwork: { homeTitle: "GUIDE SPACE", roleWord: "Guide", clientWord: "students", sessionWord: "practice", emoji: "🌬️" },
  mobility: { homeTitle: "COACH HQ", roleWord: "Coach", clientWord: "clients", sessionWord: "session", emoji: "🤸" },
  mindfulness: { homeTitle: "GUIDE SPACE", roleWord: "Guide", clientWord: "students", sessionWord: "practice", emoji: "🌿" },
};

export function vocabFor(specialty: string | null | undefined): SpecialtyVocab {
  return specialtyVocab[specialty ?? ""] ?? { homeTitle: "COACH HQ", roleWord: "Coach", clientWord: "clients", sessionWord: "session", emoji: "🏋️" };
}
