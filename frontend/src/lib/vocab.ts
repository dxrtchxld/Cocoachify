export type SpecialtyVocab = {
  homeTitle: string;
  roleWord: string; // Coach / Guide
  clientWord: string; // clients / students
  sessionWord: string; // workout / practice
  icon: string;
};

export const specialtyVocab: Record<string, SpecialtyVocab> = {
  fitness: { homeTitle: "COACH HQ", roleWord: "Coach", clientWord: "clients", sessionWord: "workout", icon: "barbell" },
  yoga: { homeTitle: "GUIDE STUDIO", roleWord: "Guide", clientWord: "students", sessionWord: "practice", icon: "leaf" },
  breathwork: { homeTitle: "GUIDE SPACE", roleWord: "Guide", clientWord: "students", sessionWord: "practice", icon: "cloud" },
  mobility: { homeTitle: "COACH HQ", roleWord: "Coach", clientWord: "clients", sessionWord: "session", icon: "body" },
  mindfulness: { homeTitle: "GUIDE SPACE", roleWord: "Guide", clientWord: "students", sessionWord: "practice", icon: "sparkles" },
};

export function vocabFor(specialty: string | null | undefined): SpecialtyVocab {
  return specialtyVocab[specialty ?? ""] ?? { homeTitle: "COACH HQ", roleWord: "Coach", clientWord: "clients", sessionWord: "session", icon: "barbell" };
}
