/**
 * Provider-neutral elicitation types.
 *
 * ACP agents can request structured input with `elicitation/create`. The client
 * renders a supported form through the same structured-question prompt used by
 * AskUserQuestion and returns the selected option. Keeping these types outside
 * `agent/acp` lets the permission layer implement the prompt without importing
 * the ACP backend.
 */

export type ElicitationFormOption = Readonly<{
  label: string;
  description?: string;
}>;

export type ElicitationForm = Readonly<{
  sessionId: string;
  /** Agent-provided prompt text. */
  message: string;
  /** The single selectable property this client can render. */
  propertyName: string;
  question: Readonly<{
    question: string;
    header?: string;
    options: readonly ElicitationFormOption[];
    multiSelect: false;
  }>;
}>;

/**
 * A user-facing answer to an elicitation.
 *
 * `accept` is returned only when the user picked one of the offered labels.
 * `decline` means the user refused; `cancel` means no answer was available
 * (unsupported shape, timeout, disposed session, or a handler error). Both
 * non-accept outcomes leave the agent's current mode untouched.
 */
export type ElicitationDecision =
  | Readonly<{ action: 'accept'; value: string }>
  | Readonly<{ action: 'decline' }>
  | Readonly<{ action: 'cancel' }>;
