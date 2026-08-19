/**
 * Deliberate violation (task 143): copy typed into a component instead of taken from the dictionary.
 *
 * One of each position a reader can meet a word in, because the rule is contextual and each position
 * is its own visitor: text a browser paints, an attribute a screen reader announces, and a string
 * printed out of an expression. The day any of the three stops producing a
 * `ui-strings/no-literal-copy` error is the day a surface can ship untranslated again — which is the
 * defect the customer photographed and this whole task exists to close.
 *
 * Linted only by `pnpm test:boundaries`.
 */
export function ApproveButton({ busy }: { busy: boolean }) {
  return (
    <button type="button" data-testid="approve" aria-label="Approve the current draft">
      {busy ? 'Approving…' : 'Approve'}
      Nothing advances until you decide.
    </button>
  );
}
