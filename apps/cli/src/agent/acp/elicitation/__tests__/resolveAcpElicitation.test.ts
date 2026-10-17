import { describe, expect, it } from 'vitest';

import { resolveAcpElicitation } from '../resolveAcpElicitation';

const APPROVE = 'Approve and execute';
const REFINE = 'Refine plan';

function buildFormRequest(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'form',
    sessionId: 'session-1',
    message: 'Approve the plan?',
    requestedSchema: {
      type: 'object',
      properties: {
        value: { type: 'string', enum: [APPROVE, REFINE] },
      },
      required: ['value'],
    },
    ...overrides,
  };
}

describe('resolveAcpElicitation', () => {
  it('accepts with the selected option value', async () => {
    const response = await resolveAcpElicitation({
      request: buildFormRequest(),
      handler: async () => ({ action: 'accept', value: APPROVE }),
    });

    expect(response).toEqual({ action: 'accept', content: { value: APPROVE } });
  });

  it('declines when no prompt surface exists', async () => {
    const response = await resolveAcpElicitation({
      request: buildFormRequest(),
      handler: null,
    });

    expect(response).toEqual({ action: 'decline' });
  });

  it('declines when the user refuses', async () => {
    const response = await resolveAcpElicitation({
      request: buildFormRequest(),
      handler: async () => ({ action: 'decline' }),
    });

    expect(response).toEqual({ action: 'decline' });
  });

  it('cancels a URL-mode elicitation instead of guessing', async () => {
    const response = await resolveAcpElicitation({
      request: {
        mode: 'url',
        sessionId: 'session-1',
        message: 'Open this URL',
        url: 'https://example.test',
        elicitationId: 'e-1',
      },
      handler: async () => ({ action: 'accept', value: APPROVE }),
    });

    expect(response).toEqual({ action: 'cancel' });
  });

  it('cancels a multi-field form', async () => {
    const response = await resolveAcpElicitation({
      request: buildFormRequest({
        requestedSchema: {
          type: 'object',
          properties: {
            value: { type: 'string', enum: [APPROVE, REFINE] },
            note: { type: 'string', enum: ['a', 'b'] },
          },
          required: ['value', 'note'],
        },
      }),
      handler: async () => ({ action: 'accept', value: APPROVE }),
    });

    expect(response).toEqual({ action: 'cancel' });
  });

  it('cancels an answer outside the requested options', async () => {
    const response = await resolveAcpElicitation({
      request: buildFormRequest(),
      handler: async () => ({ action: 'accept', value: 'Something else' }),
    });

    expect(response).toEqual({ action: 'cancel' });
  });

  it('cancels when the prompt times out', async () => {
    const pending = Promise.withResolvers<never>();
    const response = await resolveAcpElicitation({
      request: buildFormRequest(),
      handler: () => pending.promise,
      timeoutMs: 5,
    });

    expect(response).toEqual({ action: 'cancel' });
  });

  it('cancels when the session is no longer active', async () => {
    const response = await resolveAcpElicitation({
      request: buildFormRequest(),
      handler: async () => ({ action: 'accept', value: APPROVE }),
      isActive: () => false,
    });

    expect(response).toEqual({ action: 'cancel' });
  });

  it('cancels when the handler throws', async () => {
    const response = await resolveAcpElicitation({
      request: buildFormRequest(),
      handler: async () => {
        throw new Error('prompt failed');
      },
    });

    expect(response).toEqual({ action: 'cancel' });
  });
});
