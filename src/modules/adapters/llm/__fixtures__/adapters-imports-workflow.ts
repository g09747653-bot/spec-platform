// FIXTURE — deliberate violation. `adapters/*` may import external SDKs and config only.
// Expected: import-x/no-restricted-paths
import { MODULE_ID } from '@/modules/workflow';

export const forbidden = MODULE_ID;
