/**
 * Plus entitlement and paywall triggers (PRODUCT §5.2, §5.3, §6.15). Framework-free rules in
 * triggers.ts and features.ts; persistence in store.ts. The UI (ui/screens/plan) renders the sheet,
 * the first-loop card and the Plan screen. In the PWA prototype nothing is sold: the Plan screen's
 * test flag switches Plus on for this phone, free, and says so.
 */
export { ALWAYS_FREE_AREAS, assertGateable, isPlusFeature, PLUS_FEATURES, type AlwaysFreeArea, type PlusFeature, type PlusFeatureInfo } from './features.ts'
export {
  afterShown,
  allowance,
  allowanceLine,
  canShowToday,
  completesLoop,
  firstCompletedExperiment,
  firstLoopSessionIds,
  FREE_DAYS_PER_MONTH,
  isPlus,
  localDay,
  monthKey,
  t1Due,
  t2Due,
  type Allowance,
  type ExperimentLike,
  type PaywallTrigger,
  type SessionLike,
  type T1Input,
  type T2Input,
} from './triggers.ts'
export { getEntitlement, getPaywallState, markPaywallShown } from './store.ts'
