// Public surface of the failure system.
//
// Import from '@/lib/failure' rather than reaching into individual files — that
// keeps the internals free to move, and makes it obvious in review when a
// module is doing something unusual (e.g. importing `copy` directly, which no
// feature should need to do).
//
// Typical usage:
//
//   // In a screen — classify and show in one step.
//   try {
//     await save();
//   } catch (e) {
//     reportAndPresent(e, { feature: 'grocery' }, () => save());
//   }
//
//   // In lib/ — classify and return; let the caller decide when to present.
//   try {
//     return ok(await fetchThing());
//   } catch (e) {
//     return err(classifyFailure(e, { feature: 'grocery-sync' }));
//   }
//
//   // Deliberately ignoring something — never a bare `catch {}`.
//   catch (e) { swallow(e, 'prefetch is best-effort', 'images'); }

export type {
  Failure,
  FailureAction,
  FailureActionKind,
  FailureCategory,
  FailureSeverity,
  Result,
} from './types';
export { err, isFailure, ok } from './types';

export { classifyFailure, makeFailure, validationFailure, type ClassifyContext } from './classify';
export { copyFor, type FailureCopy } from './copy';
export { backoffDelayMs, isRetryable, maxAttemptsFor } from './policy';
export { withRetry, withTimeout, type RetryOptions } from './retry';

export {
  connectionType,
  isOnline,
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  useConnectivity,
  waitForConnection,
} from './connectivity';

export {
  consecutiveFailures,
  currentScreenName,
  failureKey,
  previousScreenName,
  recentFailures,
  reportAbandon,
  reportFailure,
  reportRecovery,
  setCurrentScreen,
  swallow,
} from './diagnostics';

export {
  presentFailure,
  reportAndPresent,
  resolveFailure,
  useFailureStore,
} from './present';
