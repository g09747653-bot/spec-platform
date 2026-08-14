import type { CapabilityId } from './model/capabilities';
import type { WorkflowSnapshot } from './snapshot';

/**
 * The optional-capability seam (constitution A6; solution.md — `capabilityRegistry`, D-3).
 *
 * `workflow` consults this registry to decide whether the Quality rows of the transition table are
 * live. The `quality` module — when it exists and `QUALITY_STAGE_ENABLED` is on — registers itself
 * here at boot; nothing imports `quality`, and with the registry empty the state machine collapses
 * to the parity ordering with no branching anywhere else.
 *
 * In Milestone 2 nothing registers, so the registry is empty in the running application by
 * construction. The engine itself never reads the registry: the assembled snapshot carries the
 * registered ids, which keeps gate evaluation pure and lets tests exercise both the registered and
 * unregistered worlds from literal snapshots (NFR-012 AC-3).
 */
export interface StageCapability {
  id: CapabilityId;
  /** Whether the session has opted into this capability — for `quality`, the persisted selection. */
  isEnabled(snapshot: WorkflowSnapshot): boolean;
}

const registry = new Map<CapabilityId, StageCapability>();

/** Called once at boot by the optional module's registration hook (task 81, Milestone 7). */
export function registerStageCapability(capability: StageCapability): void {
  registry.set(capability.id, capability);
}

/** The ids the snapshot assembler records — the engine sees these, never the registry itself. */
export function registeredCapabilityIds(): readonly CapabilityId[] {
  return [...registry.keys()];
}

/**
 * The registered capability itself, for the one caller that needs to *ask it something* rather than
 * know it exists: the export boundary, which resolves a `QualityPort` from it (task 72).
 *
 * Deliberately not used by the engine. Gates read `snapshot.capabilities` — a list of ids — so gate
 * evaluation stays pure and testable from literals (NFR-012 AC-1/AC-2). Handing the engine a live
 * object would put a `Promise`-returning method inside a synchronous pure function's reach, which is
 * how "the gate asked the module" starts.
 */
export function registeredCapability(id: CapabilityId): StageCapability | null {
  return registry.get(id) ?? null;
}

/** Test seam: the registry is module-level state, and tests must not leak registrations. */
export function clearStageCapabilities(): void {
  registry.clear();
}
