// FIXTURE — deliberate violation. Nothing may import `quality` (constitution A6).
// Expected: import-x/no-restricted-paths
import { MODULE_ID } from '@/modules/quality';

export const forbidden = MODULE_ID;
