'use strict';

/**
 * Allows CLI scripts (tsx) to import modules that use `import 'server-only'`.
 * Next.js server components rely on that guard; one-off dev scripts bypass it.
 */
const Module = require('module');

Module._load = new Proxy(Module._load, {
  apply(target, thisArg, args) {
    if (args[0] === 'server-only') {
      return {};
    }
    return Reflect.apply(target, thisArg, args);
  },
});
