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

/** Test seam: the registry is module-level state, and tests must not leak registrations. */
export function clearStageCapabilities(): void {
  registry.clear();
}
