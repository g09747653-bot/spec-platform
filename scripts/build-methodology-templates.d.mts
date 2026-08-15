/**
 * Types for the template generator, so the drift guard in
 * `src/modules/methodologies/templates/vendored.test.ts` can import it without an implicit `any`
 * (constitution — Coding Standards).
 *
 * The script itself stays plain ESM: it runs under bare `node` as part of the build, and a `.ts`
 * generator would need a toolchain to produce the file the toolchain then compiles.
 */
export declare function renderVendoredModule(): string;
