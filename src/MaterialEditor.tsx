import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/registry/hardware/ui/button';
import {
  builtinMaterials,
  families,
  self,
  unset,
  type ContactRule,
  type Material,
  type MaterialDraft,
  type MaterialErrors,
  type MaterialResult,
} from './materials';

type Props = {
  material?: Material;
  catalog: readonly Material[];
  onCommit: (id: number | null, draft: MaterialDraft) => Promise<MaterialResult>;
  onClose: () => void;
};

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="sw-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <span className="sw-field-error" id={id + '-error'}>
          {error}
        </span>
      )}
    </div>
  );
}

function inputProps(id: string, error?: string) {
  return { id, 'aria-invalid': !!error, 'aria-describedby': error ? id + '-error' : undefined };
}

const colorPattern = /^#[0-9a-f]{6}$/i;
const newDraft: MaterialDraft = {
  name: '',
  color: '#C890FF',
  family: 'powder',
  density: '50',
  rules: [],
};

export default function MaterialEditor({ material, catalog, onCommit, onClose }: Props) {
  const [draft, setDraft] = useState<MaterialDraft>(() =>
    material ? { ...material, density: String(material.density) } : newDraft,
  );
  const [errors, setErrors] = useState<MaterialErrors>({});
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const panel = dialog.current!;
    panel.showModal();
    title.current?.focus();
    return () => {
      panel.close();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (Object.keys(errors).length)
      dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
  }, [errors]);

  function change<K extends keyof MaterialDraft>(key: K, value: MaterialDraft[K]) {
    setDraft((draft) => ({ ...draft, [key]: value }));
    setErrors((errors) => ({ ...errors, [key]: undefined, form: undefined }));
  }

  function changeRule<K extends keyof ContactRule>(index: number, key: K, value: ContactRule[K]) {
    setDraft((draft) => ({
      ...draft,
      rules: draft.rules.map((rule, i) => (i === index ? { ...rule, [key]: value } : rule)),
    }));
    setErrors((errors) => ({
      ...errors,
      rules: errors.rules?.map((rule, i) => (i === index ? { ...rule, [key]: undefined } : rule)),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await onCommit(material?.id ?? null, draft);
      if ('errors' in result) setErrors(result.errors);
      else onClose();
    } catch {
      setErrors({ form: 'The material could not be applied. Try again.' });
    } finally {
      setPending(false);
    }
  }

  const ownId = material?.id ?? self;
  const choices = [
    { id: ownId, name: 'This material' },
    ...builtinMaterials,
    ...catalog.filter(({ id }) => id !== ownId),
  ].map(({ id, name }) => (
    <option key={id} value={id}>
      {name}
    </option>
  ));
  const outputs = (index: number, key: 'own' | 'other', label: string) => {
    const id = `sw-rule-${index}-${key}`;
    const error = errors.rules?.[index]?.[key];
    return (
      <Field id={id} label={label} error={error}>
        <select
          {...inputProps(id, error)}
          value={draft.rules[index][key] ?? 'keep'}
          onChange={(e) =>
            changeRule(index, key, e.target.value === 'keep' ? null : Number(e.target.value))
          }
        >
          <option value="keep">Keep original</option>
          <option value={0}>Leave empty</option>
          {choices}
        </select>
      </Field>
    );
  };

  return (
    <dialog
      ref={dialog}
      className="sw-editor"
      aria-labelledby="sw-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <header>
          <h2 id="sw-editor-title" ref={title} tabIndex={-1}>
            {material ? 'Edit material' : 'New material'}
          </h2>
        </header>
        <div className="sw-editor-body" inert={pending}>
          <Field id="sw-name" label="Name" error={errors.name}>
            <input
              {...inputProps('sw-name', errors.name)}
              value={draft.name}
              onChange={(e) => change('name', e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field id="sw-color" label="Color" error={errors.color}>
            <div className="sw-color">
              <input
                {...inputProps('sw-color', errors.color)}
                value={draft.color}
                onChange={(e) => change('color', e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <input
                type="color"
                aria-label="Pick a color"
                value={colorPattern.test(draft.color) ? draft.color : '#c890ff'}
                onChange={(e) => change('color', e.target.value.toUpperCase())}
              />
            </div>
          </Field>
          <div className="sw-motion-fields">
            <Field id="sw-family" label="Movement" error={errors.family}>
              <select
                {...inputProps('sw-family', errors.family)}
                value={draft.family}
                onChange={(e) => change('family', e.target.value as MaterialDraft['family'])}
              >
                {Object.entries(families).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="sw-density" label="Density (1–100)" error={errors.density}>
              <input
                {...inputProps('sw-density', errors.density)}
                value={draft.density}
                onChange={(e) => change('density', e.target.value)}
                inputMode="decimal"
                autoComplete="off"
              />
            </Field>
          </div>
          <section className="sw-reactions" aria-labelledby="sw-reactions-title">
            <div className="sw-reactions-heading">
              <h3 id="sw-reactions-title">Contact reactions</h3>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  change('rules', [...draft.rules, { with: unset, own: null, other: null }])
                }
              >
                Add reaction
              </Button>
            </div>
            {draft.rules.map((rule, index) => {
              const id = `sw-rule-${index}-with`;
              const error = errors.rules?.[index]?.with;
              return (
                <fieldset key={index} className="sw-rule">
                  <legend>Reaction {index + 1}</legend>
                  <Field id={id} label="Touches" error={error}>
                    <select
                      {...inputProps(id, error)}
                      value={rule.with}
                      onChange={(e) => changeRule(index, 'with', Number(e.target.value))}
                    >
                      <option value={unset}>Choose a material</option>
                      {choices}
                    </select>
                  </Field>
                  <div className="sw-outputs">
                    {outputs(index, 'own', 'This material becomes')}
                    {outputs(index, 'other', 'Contact material becomes')}
                  </div>
                  <Button
                    type="button"
                    disabled={pending}
                    aria-label={`Remove reaction ${index + 1}`}
                    onClick={() =>
                      change(
                        'rules',
                        draft.rules.filter((_, i) => index !== i),
                      )
                    }
                  >
                    Remove
                  </Button>
                </fieldset>
              );
            })}
          </section>
        </div>
        <footer>
          {errors.form && (
            <p className="sw-field-error" role="alert" tabIndex={-1}>
              {errors.form}
            </p>
          )}
          <div>
            <Button type="button" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={pending}>
              {pending ? 'Applying…' : material ? 'Apply changes' : 'Create material'}
            </Button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
