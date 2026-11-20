export const M = {
  Empty: 0,
  Sand: 1,
  Gravel: 2,
  Smoke: 3,
  Wood: 4,
  Flame: 5,
  Ember: 6,
  Water: 7,
  WetSand: 8,
  Ice: 9,
  Steam: 10,
  MoltenGlass: 11,
  Glass: 12,
  Lava: 13,
  Rock: 14,
  Char: 15,
  Ash: 16,
} as const;

export const families = {
  powder: 'Powder',
  liquid: 'Liquid',
  gas: 'Gas',
  solid: 'Fixed solid',
} as const;
type Family = keyof typeof families;
export type ContactRule = { with: number; own: number | null; other: number | null };
export type Material = {
  id: number;
  name: string;
  color: string;
  family: Family;
  density: number;
  rules: ContactRule[];
};
export type MaterialDraft = Omit<Material, 'id' | 'density'> & { density: string };
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
export const builtinMaterials: MaterialChoice[] = Object.entries(M)
  .filter(([, id]) => id !== M.Empty)
  .map(([key, id]) => ({ id, name: key.replace(/([a-z])([A-Z])/g, '$1 $2') }));

export function contactKey(a: number, b: number) {
  return Math.min(a, b) * 256 + Math.max(a, b);
}

const normalizeName = (name: string) => name.trim().normalize('NFKC').toLowerCase();

function validate(
  id: number,
  material: Material,
  catalog: readonly Material[],
  pairs: Set<number>,
): MaterialErrors {
  const errors: MaterialErrors = {};
  const name = typeof material.name === 'string' ? normalizeName(material.name) : '';
  if (!name) errors.name = 'Enter a material name.';
  else if (
    builtinMaterials.some((m) => normalizeName(m.name) === name) ||
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
    (Number.isInteger(value) && value > 0 && value < firstCustom) ||
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
    rules: draft.rules.map(({ with: other, own, other: result }) => ({
      with: resolveSelf(other),
      own: resolveSelf(own),
      other: resolveSelf(result),
    })),
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
        m.rules.length > 255 ||
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
