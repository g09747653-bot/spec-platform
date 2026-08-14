import type { QualityPort } from '@/modules/specs/export/quality-port';

import { registeredCapability } from './capabilities';

/**
 * Where the capability registry meets the export boundary (task 72; constitution A6).
 *
 * `specs` declares the shape it consumes and `workflow` owns the registry, so the join between them
 * lives here — in the module that already holds one half and is permitted to import the other.
 * Neither side gains a dependency on `quality`, which is the whole arrangement A6 asks for: with the
 * module uninstalled this function returns `null` and every export resolves to the parity bundle,
 * with no branch anywhere else and nothing to remove.
 *
 * **Through Milestone 6 this always returns `null`**, because nothing registers a capability until
 * task 82. That is not a placeholder: it is the parity path, and it is the path every export in the
 * MVP takes. Task 82 makes the same function start returning a port, and no caller changes.
 */
export function qualityExportPort(): QualityPort {
  const capability = registeredCapability('quality');

  /*
   * A structural check rather than a cast. The registry stores the general `StageCapability`, and the
   * export boundary needs the narrower question-asking half; asking whether the registered object can
   * answer it is honest about the fact that the registry does not guarantee it. A capability that
   * cannot answer is not a port — it is treated as absent, and the export stays in the parity path
   * rather than calling something that is not there.
   */
  if (capability === null || !('isStale' in capability)) return null;

  const { isStale } = capability as { isStale: unknown };

  return typeof isStale === 'function' ? (capability as unknown as QualityPort) : null;
}
