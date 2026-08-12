// FIXTURE — positive control. `prompts` MAY import `specs` (the section schema).
// Expected: no error. This proves the rule permits the allowed edges rather than
// rejecting every cross-module import.
import { MODULE_ID } from '@/modules/specs';

export const allowed = MODULE_ID;
