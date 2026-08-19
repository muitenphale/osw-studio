/**
 * Property table and stepping ladders for the Styles tab.
 * Entries list longhands (not shorthands) so per-side stepping and loss reporting work on individual values.
 * Ladders are a proposed scale — not derived from project tokens yet.
 */

import { SHORTHAND_LONGHANDS } from '@/lib/preview/style-preview';

/** Where an entry sits in the panel. Presentation only. */
export type PropertyGroup = 'Spacing' | 'Type' | 'Colour' | 'Border' | 'Layout';

/**
 * What the value *is*, which decides how a computed string is read back.
 *
 * - `length` — written with a unit, computed back in px. Needs a px-per-unit divisor.
 * - `ratio` — unitless (`line-height`). Chrome computes it to px, so reading it back needs the
 *   element's own `font-size` as the divisor, which is why `line-height`'s entry reads both.
 * - `keyword` — compared as a string.
 * - `color` — not compared here at all; Task 5's token detection owns that.
 */
export type ValueKind = 'length' | 'ratio' | 'keyword' | 'color';

export type ControlKind = 'stepper' | 'segmented' | 'swatch';

/**
 * The units a stepper can write.
 *
 * `''` is unitless — `line-height: 1.5`, the only property in the table whose value is legal with no
 * unit at all. It is a member of this type rather than a separate case because the control offers it
 * in the same selector as the other two, and CSS accepts all three there.
 */
export type StyleUnit = 'rem' | 'px' | '';

/** What the unit selector prints. `×` for unitless, because `1.5×` is how a ratio reads aloud. */
export const UNIT_LABELS: Readonly<Record<StyleUnit, string>> = {
  rem: 'rem',
  px: 'px',
  '': '×',
};

/** Units offered for a length. Order is menu order. */
const LENGTH_UNITS: readonly StyleUnit[] = ['rem', 'px'];

/** Unitless first: it inherits as a ratio, the others as fixed lengths. */
const RATIO_UNITS: readonly StyleUnit[] = ['', 'rem', 'px'];

export interface SegmentedOption {
  /** Written verbatim into the declaration. */
  value: string;
  label: string;
  /**
   * Extra computed spellings that count as this option.
   *
   * `text-align` is the reason: an untouched element computes to `start`, not `left`, so without
   * this the commonest case in the project would light up nothing. Deliberately narrow — it lists
   * synonyms, never neighbours, so `justify` still matches no option at all.
   */
  matches?: readonly string[];
}

interface BaseEntry {
  /** Stable key for React and for tests. */
  id: string;
  group: PropertyGroup;
  label: string;
  /** The CSS property written into `/overrides.css`. */
  property: string;
  /** The computed property names to ask the frame for, and the keys its replies come back under. */
  read: readonly string[];
}

/**
 * One side or corner of a shorthand, as its own writable property.
 *
 * The computed value is already in hand: the parent's {@link BaseEntry.read} names every longhand,
 * so an expanded row costs no extra round trip to the frame. What it adds is the ability to *write*
 * one of them, which the collapsed control cannot — its whole value is a single number.
 */
export interface StepperPart {
  /** The longhand written, and the name its computed value comes back under. */
  property: string;
  label: string;
}

export interface StepperEntry extends BaseEntry {
  control: 'stepper';
  /**
   * The sides or corners this control can be opened up into.
   *
   * Absent for a value that has no parts — `font-size` is one number about the whole element.
   * `Mixed` on a control that has parts is the signal that opening it will say something: the
   * longhands disagree, which is exactly the case the collapsed control cannot express.
   */
  parts?: readonly StepperPart[];
  kind: 'length' | 'ratio';
  /**
   * The unit written **until the user picks another one**, and the unit the ladder is expressed in.
   *
   * Not a fixed property of the declaration any more: the control carries a unit selector, and
   * switching it converts the element's current size into the new unit rather than relabelling the
   * number — see `convertUnit` in `./controls.tsx`. This is the default and the ladder's own unit,
   * which is why {@link ladder} does not move when the display unit does.
   */
  unit: StyleUnit;
  /** Every unit this property may be written in, in menu order. Must contain {@link unit}. */
  units: readonly StyleUnit[];
  /**
   * The rungs `+` and `−` land on, **in {@link unit}** whatever the control is currently displaying.
   *
   * A ladder is a scale — `1.125rem` is a type-scale step and `18px` is the same step; expressing the
   * rungs in the display unit would make `+` in px walk a scale nobody designed. Stepping therefore
   * converts into ladder space, steps, and converts the rung back out.
   */
  ladder: readonly number[];
  /**
   * For a ratio: the computed property whose px value one ladder unit is worth.
   *
   * Must also appear in {@link BaseEntry.read} — it is fetched in the same reply — but it is not a
   * *value* of this entry, so it is excluded when the read names are checked for agreement.
   */
  divisor?: string;
}

/** A choice between named keyword values. Numbers use a stepper instead. */
export interface SegmentedEntry extends BaseEntry {
  control: 'segmented';
  kind: 'keyword';
  options: readonly SegmentedOption[];
}

export interface SwatchEntry extends BaseEntry {
  control: 'swatch';
  kind: 'color';
}

export type StyleProperty = StepperEntry | SegmentedEntry | SwatchEntry;

/** The spacing scale. See the module note — this is a proposal, not a reading of the templates. */
const SPACING_LADDER = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6] as const;

/** The type scale, in rem. */
const TYPE_LADDER = [0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.875, 2.25, 3] as const;

/** Every property the tab edits. */
export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  {
    id: 'padding-block',
    group: 'Spacing',
    label: 'Padding, vertical',
    property: 'padding-block',
    read: ['padding-block-start', 'padding-block-end'],
    control: 'stepper',
    kind: 'length',
    unit: 'rem',
    units: LENGTH_UNITS,
    ladder: SPACING_LADDER,
    parts: [
      { property: 'padding-block-start', label: 'Top' },
      { property: 'padding-block-end', label: 'Bottom' },
    ],
  },
  {
    id: 'padding-inline',
    group: 'Spacing',
    label: 'Padding, horizontal',
    property: 'padding-inline',
    read: ['padding-inline-start', 'padding-inline-end'],
    control: 'stepper',
    kind: 'length',
    unit: 'rem',
    units: LENGTH_UNITS,
    ladder: SPACING_LADDER,
    parts: [
      { property: 'padding-inline-start', label: 'Left' },
      { property: 'padding-inline-end', label: 'Right' },
    ],
  },
  {
    id: 'margin-block',
    group: 'Spacing',
    label: 'Margin, vertical',
    property: 'margin-block',
    read: ['margin-block-start', 'margin-block-end'],
    control: 'stepper',
    kind: 'length',
    unit: 'rem',
    units: LENGTH_UNITS,
    ladder: SPACING_LADDER,
    parts: [
      { property: 'margin-block-start', label: 'Top' },
      { property: 'margin-block-end', label: 'Bottom' },
    ],
  },
  {
    id: 'margin-inline',
    group: 'Spacing',
    label: 'Margin, horizontal',
    property: 'margin-inline',
    read: ['margin-inline-start', 'margin-inline-end'],
    control: 'stepper',
    kind: 'length',
    unit: 'rem',
    units: LENGTH_UNITS,
    ladder: SPACING_LADDER,
    parts: [
      { property: 'margin-inline-start', label: 'Left' },
      { property: 'margin-inline-end', label: 'Right' },
    ],
  },
  {
    id: 'font-size',
    group: 'Type',
    label: 'Size',
    property: 'font-size',
    read: ['font-size'],
    control: 'stepper',
    kind: 'length',
    unit: 'rem',
    units: LENGTH_UNITS,
    ladder: TYPE_LADDER,
  },
  {
    id: 'line-height',
    group: 'Type',
    label: 'Line height',
    // `font-size` is not a longhand of `line-height`; it is the divisor. Chrome computes
    // `line-height` to px, so a unitless ladder cannot be read back without it.
    read: ['line-height', 'font-size'],
    property: 'line-height',
    control: 'stepper',
    kind: 'ratio',
    unit: '',
    units: RATIO_UNITS,
    ladder: [1, 1.25, 1.5, 1.75, 2],
    divisor: 'font-size',
  },
  {
    id: 'text-align',
    group: 'Type',
    label: 'Align',
    property: 'text-align',
    read: ['text-align'],
    control: 'segmented',
    kind: 'keyword',
    options: [
      { value: 'left', label: 'Left', matches: ['start'] },
      { value: 'center', label: 'Centre' },
      { value: 'right', label: 'Right', matches: ['end'] },
    ],
  },
  {
    id: 'color',
    group: 'Colour',
    label: 'Text',
    property: 'color',
    read: ['color'],
    control: 'swatch',
    kind: 'color',
  },
  {
    id: 'background-color',
    group: 'Colour',
    label: 'Background',
    property: 'background-color',
    read: ['background-color'],
    control: 'swatch',
    kind: 'color',
  },
  {
    id: 'border-style',
    group: 'Border',
    label: 'Style',
    property: 'border-style',
    read: SHORTHAND_LONGHANDS['border-style'],
    control: 'segmented',
    kind: 'keyword',
    options: [
      { value: 'none', label: 'None' },
      { value: 'solid', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
    ],
  },
  {
    id: 'border-width',
    group: 'Border',
    label: 'Width',
    property: 'border-width',
    read: SHORTHAND_LONGHANDS['border-width'],
    control: 'stepper',
    kind: 'length',
    unit: 'px',
    units: LENGTH_UNITS,
    ladder: [0, 1, 2, 4],
    parts: [
      { property: 'border-top-width', label: 'Top' },
      { property: 'border-right-width', label: 'Right' },
      { property: 'border-bottom-width', label: 'Bottom' },
      { property: 'border-left-width', label: 'Left' },
    ],
  },
  {
    id: 'border-radius',
    group: 'Border',
    label: 'Corner radius',
    property: 'border-radius',
    read: SHORTHAND_LONGHANDS['border-radius'],
    control: 'stepper',
    kind: 'length',
    unit: 'px',
    units: LENGTH_UNITS,
    ladder: [0, 4, 8, 16, 999],
    parts: [
      { property: 'border-top-left-radius', label: 'Top left' },
      { property: 'border-top-right-radius', label: 'Top right' },
      { property: 'border-bottom-right-radius', label: 'Bottom right' },
      { property: 'border-bottom-left-radius', label: 'Bottom left' },
    ],
  },
  {
    id: 'display',
    group: 'Layout',
    label: 'Display',
    property: 'display',
    read: ['display'],
    control: 'segmented',
    kind: 'keyword',
    options: [
      { value: 'block', label: 'Block' },
      { value: 'flex', label: 'Flex' },
      { value: 'grid', label: 'Grid' },
      { value: 'none', label: 'Hidden' },
    ],
  },
];

/**
 * Shorthand → its longhands, for the invariant the table is checked against.
 *
 * Extends the frame's table rather than restating it, so the physical box shorthands have one
 * definition. The logical ones are added here because the frame has no need of them — it expands
 * what it is *asked* for, and it is asked for the `read` lists below, which are already longhands.
 */
export const CSS_SHORTHANDS: Readonly<Record<string, readonly string[]>> = {
  ...SHORTHAND_LONGHANDS,
  'padding-block': ['padding-block-start', 'padding-block-end'],
  'padding-inline': ['padding-inline-start', 'padding-inline-end'],
  'margin-block': ['margin-block-start', 'margin-block-end'],
  'margin-inline': ['margin-inline-start', 'margin-inline-end'],
};

/** Every computed property name the tab needs, deduplicated, in table order. */
export const QUERY_PROPERTIES: readonly string[] = Array.from(
  new Set(STYLE_PROPERTIES.flatMap(entry => entry.read)),
);

/**
 * The read names that carry this entry's *value*, as opposed to the divisor it also fetches.
 *
 * A stepper over several sides is only showing a number when the sides agree; this is the set that
 * has to agree. `line-height` reads `font-size` too and would never agree with it.
 */
export function valueNames(entry: StyleProperty): readonly string[] {
  const divisor = entry.control === 'stepper' ? entry.divisor : undefined;
  return divisor ? entry.read.filter(name => name !== divisor) : entry.read;
}

/** Entry lookup by the property actually written. */
export function propertyEntry(property: string): StyleProperty | undefined {
  return STYLE_PROPERTIES.find(entry => entry.property === property);
}

/**
 * The computed names a written property comes back under.
 *
 * Falls back to the property itself so a declaration the table does not own — there are none today,
 * but the reducer takes declarations, not entries — still names something the frame can answer.
 */
export function readNamesFor(property: string): readonly string[] {
  return propertyEntry(property)?.read ?? [property];
}

/** Ladder numbers are exact halves and quarters, so this only absorbs float division noise. */
const EPSILON = 1e-6;

/**
 * Move one step along a ladder.
 *
 * Both ends clamp: stepping up from the top stays at the top and stepping down from the bottom stays
 * at the bottom, rather than running off the array into `undefined` or producing a negative length.
 *
 * A value that is not *on* the ladder — an element whose padding the project set to `0.9rem` — steps
 * to the nearest ladder value in the requested direction. That is the same answer as "snap to the
 * nearest step, then step unless snapping already moved you the right way", for every input, and it
 * needs no special case for a tie.
 *
 * `null` means the computed value could not be read as a number (`auto`, `normal`, an empty reply).
 * Both directions then land on the bottom of the ladder, because there is no position to move from
 * and the bottom is the only value that is definitely representable.
 */
export function stepLadder(
  ladder: readonly number[],
  current: number | null,
  direction: 1 | -1,
): number {
  const first = ladder[0];
  const last = ladder[ladder.length - 1];
  if (current === null || !Number.isFinite(current)) return first;

  if (direction === 1) {
    for (const value of ladder) {
      if (value > current + EPSILON) return value;
    }
    return last;
  }

  for (let i = ladder.length - 1; i >= 0; i--) {
    if (ladder[i] < current - EPSILON) return ladder[i];
  }
  return first;
}

/**
 * A part, as a stepper entry in its own right.
 *
 * Everything the collapsed control does — reading a computed value, stepping the ladder, converting
 * units, writing — already works on a `StepperEntry`. Rather than a second implementation for sides,
 * a part borrows its parent's whole configuration and changes only what it *is*: the property it
 * writes and the single name it reads back under. `parts` is dropped so a part cannot itself expand.
 */
export function partEntry(parent: StepperEntry, part: StepperPart): StepperEntry {
  return {
    ...parent,
    parts: undefined,
    id: `${parent.id}:${part.property}`,
    label: part.label,
    property: part.property,
    read: [part.property],
  };
}

/** Flat set of all writable properties including longhands. */
export const WRITABLE_PROPERTIES: readonly StyleProperty[] = STYLE_PROPERTIES.flatMap(entry =>
  entry.control === 'stepper' && entry.parts
    ? [entry, ...entry.parts.map(part => partEntry(entry, part))]
    : [entry],
);
