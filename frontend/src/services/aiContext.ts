// Shared, module-level holder for the "current document context" the AI assistant
// should use. Any page can publish its active content here; the global AiAssistant
// FAB reads it when sending a message. Defaults to empty (AI works without context).
export const aiContext = { current: '' as string };
