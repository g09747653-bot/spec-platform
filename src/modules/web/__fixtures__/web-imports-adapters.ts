// FIXTURE — deliberate violation. `web` may never import an adapter.
// Expected: import-x/no-restricted-paths
import { MODULE_ID } from '@/modules/adapters/llm';

export const forbidden = MODULE_ID;
