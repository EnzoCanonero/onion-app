import { getStorageBackend } from "./storageBackend";

const ONBOARDING_KEY = "focustree.onboarding";

export type OnboardingProgress = {
  grandPlanTutorialComplete: boolean;
  monthSetupTutorialComplete: boolean;
  dailyAgendaTutorialComplete: boolean;
};

const DEFAULT_PROGRESS: OnboardingProgress = {
  grandPlanTutorialComplete: false,
  monthSetupTutorialComplete: false,
  dailyAgendaTutorialComplete: false,
};

export function loadOnboarding(): OnboardingProgress {
  try {
    const raw = getStorageBackend().getItem(ONBOARDING_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw);
    return {
      grandPlanTutorialComplete: !!parsed.grandPlanTutorialComplete,
      monthSetupTutorialComplete: !!parsed.monthSetupTutorialComplete,
      dailyAgendaTutorialComplete: !!parsed.dailyAgendaTutorialComplete,
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveOnboarding(progress: OnboardingProgress): void {
  getStorageBackend().setItem(ONBOARDING_KEY, JSON.stringify(progress));
}
