// SPEC-01 registry Checkbox, text-label variant with controlled state.
import { Checkbox as SdkCheckbox, CheckboxIndicator } from '@ui-sdk/react/checkbox';

function Checkbox({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label data-kit="check">
      <SdkCheckbox
        data-kit="checkbox"
        aria-label={label}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      >
        <CheckboxIndicator data-kit="checkbox-indicator" keepMounted />
      </SdkCheckbox>
      <span data-kit="label">{label}</span>
    </label>
  );
}

export { Checkbox };
