import type { BetterAuthClientPlugin } from 'better-auth';

import type { magicLink } from './magic-link-plugin';

/** Client half of `magicLink`: adds `authClient.signIn.magicLink`. */
export const magicLinkClient = () =>
  ({
    id: 'magic-link',
    $InferServerPlugin: {} as ReturnType<typeof magicLink>,
  }) satisfies BetterAuthClientPlugin;
