import { M } from './materialIds.ts';
import { builtinById, builtinMaterials } from './builtinRegistry.ts';
export { M, builtinById, builtinMaterials };

export const families = {
  powder: 'Powder',
  liquid: 'Liquid',
  gas: 'Gas',
  solid: 'Fixed solid',
} as const;
type Family = keyof typeof families;
export const ruleLimits = {
  minTemperature: [-150, 2300],
  maxTemperature: [-150, 2300],
  minPressure: [-12, 12],
  maxPressure: [-12, 12],
  heatExchange: [-200, 200],
} as const;
type RuleQuantity = keyof typeof ruleLimits;
const ruleQuantities = Object.keys(ruleLimits) as RuleQuantity[];
type ContactOutputs = { with: number; own: number | null; other: number | null };
export type ContactRule = ContactOutputs & Partial<Record<RuleQuantity, number>>;
export type ContactRuleDraft = ContactOutputs & Partial<Record<RuleQuantity, string | number>>;
export type Material = {
  id: number;
  name: string;
  color: string;
  family: Family;
  density: number;
  rules: ContactRule[];
};
export type MaterialDraft = Omit<Material, 'id' | 'density' | 'rules'> & {
  density: string;
  rules: ContactRuleDraft[];
};
export type MaterialChoice = Pick<Material, 'id' | 'name'>;
type RuleErrors = Partial<Record<keyof ContactRule, string>>;
export type MaterialErrors = Partial<
  Record<'name' | 'color' | 'family' | 'density' | 'form', string>
> & {
  rules?: RuleErrors[];
};
export type MaterialResult = { id: number } | { errors: MaterialErrors };

export const firstCustom = M.Ash + 1;
export const self = -1;
export const unset = -2;

export function contactKey(a: number, b: number) {
  return Math.min(a, b) * 0x10000 + Math.max(a, b);
}

const normalizeName = (name: string) => name.trim().normalize('NFKC').toLowerCase();
const builtinNames = new Map(builtinMaterials.map((m) => [normalizeName(m.name), m.id]));

function validate(
  id: number,
  material: Material,
  catalog: readonly Material[],
  pairs: Set<number>,
): MaterialErrors {
  const errors: MaterialErrors = {};
  const name = typeof material.name === 'string' ? normalizeName(material.name) : '';
  const builtinId = builtinNames.get(name);
  // Earlier releases allowed custom names such as Slush. Keep them editable on their original ID.
  const keepsLegacyName = builtinId !== undefined && builtinId >= M.Slush &&
    catalog.some((old) => old.id === id && normalizeName(old.name) === name);
  if (!name) errors.name = 'Enter a material name.';
  else if (
    (builtinId !== undefined && !keepsLegacyName) ||
    catalog.some((m) => m.id !== id && normalizeName(m.name) === name)
  )
    errors.name = 'That material name is already in use.';
  if (typeof material.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(material.color))
    errors.color = 'Enter a six-digit hex color, such as #C890FF.';
  if (typeof material.family !== 'string' || !Object.hasOwn(families, material.family))
    errors.family = 'Choose a movement family.';
  if (!Number.isFinite(material.density) || material.density < 1 || material.density > 100)
    errors.density = 'Enter a density from 1 to 100.';
  const known = (value: number) =>
    value === id ||
    builtinById(value) !== undefined ||
    catalog.some((m) => m.id === value);
  const validOutput = (value: number | null) => value === null || value === M.Empty || known(value);
  const rules = material.rules.map((rule) => {
    const error: RuleErrors = {};
    if (!known(rule.with)) error.with = 'Choose a material for this contact.';
    else {
      const key = contactKey(id, rule.with);
      if (pairs.has(key)) error.with = 'A reaction already exists for this pair.';
      pairs.add(key);
    }
    if (!validOutput(rule.own)) error.own = 'Choose a result for this material.';
    if (!validOutput(rule.other)) error.other = 'Choose a result for the contact material.';
    for (const key of ruleQuantities) {
      const value = rule[key];
      const [min, max] = ruleLimits[key];
      if (value !== undefined && (!Number.isFinite(value) || value < min || value > max))
        error[key] = `Enter a number from ${min} to ${max}.`;
    }
    for (const [low, high] of [
      ['minTemperature', 'maxTemperature'],
      ['minPressure', 'maxPressure'],
    ] as const) {
      if (!error[low] && !error[high] && rule[low] !== undefined && rule[high] !== undefined &&
          rule[low] > rule[high])
        error[high] = 'Maximum must be at least the minimum.';
    }
    if (rule.heatExchange && !error.heatExchange) {
      const own = rule.own ?? id;
      const other = rule.other ?? rule.with;
      if (contactKey(own, other) === contactKey(id, rule.with))
        error.heatExchange = 'Heat exchange requires a change in materials.';
    }
    return error;
  });
  if (rules.some((rule) => Object.keys(rule).length)) errors.rules = rules;
  return errors;
}

export function editMaterial(
  catalog: readonly Material[],
  editing: number | null,
  draft: MaterialDraft,
): { material: Material } | { errors: MaterialErrors } {
  if (editing !== null && !catalog.some((material) => material.id === editing))
    return { errors: { form: 'This material is no longer available.' } };
  const id = editing ?? (catalog.at(-1)?.id ?? M.Ash) + 1;
  if (id > 255) return { errors: { form: 'This world already has 239 custom materials.' } };
  const resolveSelf = <T extends number | null>(value: T) => (value === self ? id : value);
  const density = draft.density.trim().replace(',', '.');
  const material = {
    id,
    name: draft.name.trim(),
    color: draft.color.trim().toUpperCase(),
    family: draft.family,
    density: /^\d+(?:\.\d+)?$/.test(density) ? Number(density) : NaN,
    rules: draft.rules.map((input) => {
      const rule: ContactRule = {
        with: resolveSelf(input.with),
        own: resolveSelf(input.own),
        other: resolveSelf(input.other),
      };
      for (const key of ruleQuantities) {
        const value = input[key];
        if (value === undefined) continue;
        if (typeof value === 'number') rule[key] = value;
        else {
          const text = value.trim().replace(',', '.');
          if (text) rule[key] = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
        }
      }
      return rule;
    }),
  };
  const pairs = new Set(
    catalog
      .filter((entry) => entry.id !== id)
      .flatMap((entry) => entry.rules.map((rule) => contactKey(entry.id, rule.with))),
  );
  const errors = validate(id, material, catalog, pairs);
  return Object.keys(errors).length ? { errors } : { material };
}

export function readMaterialCatalog(text: string): Material[] {
  const catalog = JSON.parse(text) as Material[];
  if (
    !Array.isArray(catalog) ||
    !catalog.length ||
    catalog.length > 256 - firstCustom ||
    catalog.some(
      (m, i) =>
        m?.id !== firstCustom + i ||
        typeof m.name !== 'string' ||
        !Array.isArray(m.rules) ||
        m.rules.length > builtinMaterials.length + catalog.length ||
        m.rules.some((rule) => !rule || typeof rule !== 'object'),
    )
  )
    throw Error('Unreadable material catalog');
  const pairs = new Set<number>();
  for (const material of catalog) {
    if (Object.keys(validate(material.id, material, catalog, pairs)).length)
      throw Error('Unreadable material catalog');
  }
  return catalog;
}
