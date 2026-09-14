import { AsyncLocalStorage } from 'node:async_hooks';

export type RsvpMagicLinkMailContext = {
  eventName: string;
  respondBy: Date;
};

const rsvpMagicLinkMailContext =
  new AsyncLocalStorage<RsvpMagicLinkMailContext>();

/**
 * Request-scoped RSVP mail intent. Set only by trusted senders
 * (`sendRsvpWave`, `resendRsvpMagicLink`) — never from `callbackURL`.
 */
export function runWithRsvpMagicLinkMailContext<T>(
  context: RsvpMagicLinkMailContext,
  fn: () => T,
): T {
  return rsvpMagicLinkMailContext.run(context, fn);
}

export function getRsvpMagicLinkMailContext():
  | RsvpMagicLinkMailContext
  | undefined {
  return rsvpMagicLinkMailContext.getStore();
}
