/** Adapter type for the UI's type-only import of the chat slot props. */
export interface ChatViewSlotProps {
  t: (key: string, params?: Record<string, string | number>) => string
}
