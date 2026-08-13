import { read, utils } from 'xlsx';

import type { Extractor } from './registry';

/**
 * Spreadsheet extraction with SheetJS (task 67; IR-004-AC-1; D-14).
 *
 * Every sheet becomes CSV under its own heading. CSV rather than a rendered table because the point is
 * the cell values: a model asked to ground a specification in a requirements matrix needs the rows, not
 * the column widths.
 *
 * **`sheetRows` is capped.** A spreadsheet is the one supported format where a small file can expand
 * into an enormous amount of text — a hundred thousand rows of numbers would swallow the context budget
 * and starve every other source. The cap is applied by the parser rather than by truncating afterwards,
 * so the work is never done in the first place.
 *
 * The package comes from SheetJS's own distribution rather than from the npm registry: the last version
 * published there is 0.18.5, which carries a prototype-pollution advisory triggered by *parsing a
 * malicious file* — precisely this code path, on precisely untrusted input.
 */

/** Rows per sheet handed to the model. Beyond this a spreadsheet is a data set, not a document. */
const MAX_ROWS_PER_SHEET = 5_000;

export const extractXlsx: Extractor = (bytes) => {
  const workbook = read(bytes, {
    type: 'array',
    sheetRows: MAX_ROWS_PER_SHEET,
    // No formula recalculation and no styling: neither reaches the text, and both cost time on a
    // request path bounded by PARSE_TIMEOUT_MS.
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const csv = sheet === undefined ? '' : utils.sheet_to_csv(sheet).trim();

    return csv === '' ? '' : `## ${name}\n\n${csv}`;
  }).filter((section) => section !== '');

  return Promise.resolve(sheets.join('\n\n'));
};
