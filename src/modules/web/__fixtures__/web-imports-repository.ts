// FIXTURE — deliberate violation. `web` may never reach a repository directly; it goes through a
// server action or route handler (constitution A1; D-13).
// Expected: import-x/no-restricted-paths
import { createProjectRepository } from '@/modules/projects/repositories/projects';

export const forbidden = createProjectRepository.name;
