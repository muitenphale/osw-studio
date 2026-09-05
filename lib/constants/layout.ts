/**
 * Below this table width a listing's row actions move into its overflow menu.
 *
 * 48rem, matching the `@max-3xl` container variant the rows use to hide their inline controls. The
 * two have to agree: the controls hide in CSS, and the menu items replacing them appear from a
 * measurement, because Radix portals menu content outside the container a query resolves against.
 */
export const COMPACT_ROW_WIDTH = 768;
