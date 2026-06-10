export type DealStep =
  | "idle"
  | "awaiting_role"
  | "awaiting_description"
  | "awaiting_amount"
  | "awaiting_currency"
  | "awaiting_confirm";

export interface DealDraft {
  role?: "seller" | "buyer";
  description?: string;
  amount?: string;
  currency?: string;
}

export interface SessionData {
  step: DealStep;
  dealDraft: DealDraft;
}

export function defaultSession(): SessionData {
  return {
    step: "idle",
    dealDraft: {},
  };
}
