export function useOnboardingTasks() {
  return {
    completions: {},
    isComplete: () => false,
    toggleTask: async () => {},
    loading: false,
  };
}
