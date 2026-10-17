import type { CreateElicitationResponse } from '@agentclientprotocol/sdk';

import { logger } from '@/ui/logger';
import { readElicitationForm } from '@/agent/elicitation/readElicitationForm';
import type { ElicitationDecision, ElicitationForm } from '@/agent/elicitation/types';

/**
 * Agent-side dialogs generally pass no timeout, so an unanswered prompt would
 * hold the turn open indefinitely. Bound it here.
 */
export const DEFAULT_ACP_ELICITATION_TIMEOUT_MS = 5 * 60_000;

export type AcpElicitationHandler = (form: ElicitationForm) => Promise<ElicitationDecision | null>;

function buildElicitationResponse(
  form: ElicitationForm,
  decision: ElicitationDecision | null,
): CreateElicitationResponse {
  if (!decision) return { action: 'cancel' };
  if (decision.action === 'decline') return { action: 'decline' };
  if (decision.action !== 'accept') return { action: 'cancel' };
  if (!form.question.options.some((option) => option.label === decision.value)) {
    // A handler must not invent an option the agent did not offer.
    logger.warn('[AcpElicitation] Ignoring an answer outside the requested options', {
      sessionId: form.sessionId,
    });
    return { action: 'cancel' };
  }
  return { action: 'accept', content: { [form.propertyName]: decision.value } };
}

/**
 * Answers an ACP `elicitation/create` request.
 *
 * The failure policy is deliberate: every unsupported, unanswered or failing
 * path settles without `accept`, because accepting is what lets the agent
 * proceed (for a plan approval, that means leaving read-only plan mode).
 */
export async function resolveAcpElicitation(
  params: Readonly<{
    request: unknown;
    handler: AcpElicitationHandler | null | undefined;
    timeoutMs?: number;
    isActive?: (() => boolean) | null;
  }>,
): Promise<CreateElicitationResponse> {
  const form = readElicitationForm(params.request);
  if (!form) return { action: 'cancel' };
  if (params.isActive && !params.isActive()) return { action: 'cancel' };
  if (!params.handler) return { action: 'decline' };

  const timeoutMs = params.timeoutMs ?? DEFAULT_ACP_ELICITATION_TIMEOUT_MS;
  const { promise: timeout, resolve: resolveTimeout } = Promise.withResolvers<'timeout'>();
  const timeoutHandle = setTimeout(() => resolveTimeout('timeout'), Math.max(0, timeoutMs));
  timeoutHandle.unref();

  try {
    const decision = await Promise.race([
      params.handler(form).catch((error: unknown) => {
        logger.warn('[AcpElicitation] Handler failed', {
          sessionId: form.sessionId,
          errorType: error instanceof Error ? error.name : typeof error,
        });
        return { action: 'cancel' } as const;
      }),
      timeout,
    ]);
    if (decision === 'timeout') {
      logger.debug('[AcpElicitation] Timed out waiting for an answer', {
        sessionId: form.sessionId,
      });
      return { action: 'cancel' };
    }
    return buildElicitationResponse(form, decision);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
