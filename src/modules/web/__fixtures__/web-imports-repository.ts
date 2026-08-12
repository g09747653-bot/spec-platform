// FIXTURE — deliberate violation. `web` may never reach a repository directly; it goes through a
// server action or route handler (constitution A1; D-13).
// Expected: import-x/no-restricted-paths
import { OwnerScope } from '@/modules/projects/repositories/owner-scope';

export const forbidden = OwnerScope.name;
