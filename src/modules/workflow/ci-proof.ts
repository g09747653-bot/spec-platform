// TEMPORARY — proves the CI boundary gate blocks a merge (task 8 acceptance criteria).
// `workflow` may never import `agents`: the engine decides flow, agents only produce content.
// This branch is never merged; it is closed and deleted once the block is demonstrated.
import { MODULE_ID } from '@/modules/agents';

export const forbidden = MODULE_ID;
