import { describe, expect, it } from 'vitest';
import { methods, type ClientApp } from '@agentclientprotocol/sdk';

import { buildInitializeRequest } from '../AcpBackend';
import { registerAcpClientHandlers } from '../connection/registerAcpClientHandlers';

type RequestHandler = (context: Readonly<{ params: unknown }>) => unknown;

function createFakeClientApp(): Readonly<{
  app: ClientApp;
  requestHandlers: Map<string, RequestHandler>;
}> {
  const requestHandlers = new Map<string, RequestHandler>();
  const app = {
    onRequest(method: string, ...args: unknown[]) {
      requestHandlers.set(method, args[args.length - 1] as RequestHandler);
      return app;
    },
    onNotification() {
      return app;
    },
  };
  return { app: app as unknown as ClientApp, requestHandlers };
}

const extensionContext = {
  method: '',
  sessionId: null,
  signal: new AbortController().signal,
  agentName: 'test',
};

describe('ACP elicitation capability', () => {
  it('advertises elicitation.form only when the backend can answer it', () => {
    const advertised = buildInitializeRequest({
      clientName: 'test',
      clientVersion: '0.0.0',
      elicitationForm: true,
    });
    const omitted = buildInitializeRequest({ clientName: 'test', clientVersion: '0.0.0' });

    expect(advertised.clientCapabilities?.elicitation).toEqual({ form: {} });
    expect(omitted.clientCapabilities?.elicitation).toBeUndefined();
  });

  it('registers elicitation/create only when a handler is wired', async () => {
    const withoutHandler = createFakeClientApp();
    registerAcpClientHandlers({
      app: withoutHandler.app,
      handlers: {
        sessionUpdate: () => {},
        requestPermission: () => ({ outcome: { outcome: 'cancelled' } }),
      },
      extensions: [],
      createExtensionContext: () => extensionContext,
    });
    expect(withoutHandler.requestHandlers.has(methods.client.elicitation.create)).toBe(false);

    const withHandler = createFakeClientApp();
    registerAcpClientHandlers({
      app: withHandler.app,
      handlers: {
        sessionUpdate: () => {},
        requestPermission: () => ({ outcome: { outcome: 'cancelled' } }),
        createElicitation: () => ({ action: 'decline' }),
      },
      extensions: [],
      createExtensionContext: () => extensionContext,
    });

    const handler = withHandler.requestHandlers.get(methods.client.elicitation.create);
    expect(handler).toBeDefined();
    expect(await handler!({ params: { mode: 'form' } })).toEqual({ action: 'decline' });
  });
});
