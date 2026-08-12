// FIXTURE — deliberate violation. `workflow` decides flow; it may never reach into `agents`.
// Expected: import-x/no-restricted-paths
import { MODULE_ID } from '@/modules/agents';

export const forbidden = MODULE_ID;
