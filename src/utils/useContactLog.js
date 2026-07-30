/**
 * Lightweight local fallback for contact log state.
 * The UI can still render without any Notion-backed contact persistence.
 */
export function useContactLog() {
  return {
    contacted: {},
    isContacted: () => false,
    logContact: async () => ({ logged: false }),
    getClientLogs: async () => [],
    loadingLog: false,
  };
}
