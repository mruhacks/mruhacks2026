import { AsyncLocalStorage } from 'node:async_hooks';

export type MagicLinkMailContext = {
  eventName: string;
  respondBy: Date;
};

const rsvpMagicLinkMailContext = new AsyncLocalStorage<MagicLinkMailContext>();

/**
 * Request-scoped RSVP mail intent. Set only by trusted senders
 * (`sendRsvpWave`, `resendRsvpMagicLink`) — never from `callbackURL`.
 */
export function runWithRsvpMagicLinkMailContext<T>(context: MagicLinkMailContext, fn: () => T): T {
  return rsvpMagicLinkMailContext.run(context, fn);
}

export function getRsvpMagicLinkMailContext(): MagicLinkMailContext | undefined {
  return rsvpMagicLinkMailContext.getStore();
}
