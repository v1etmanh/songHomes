import { formatMoney } from '../lib/money';

export interface AddOnOption {
  addOnId: string;
  name: string;
  priceCents: number;
  unitLabel: string;
}

export interface AddOnPickerProps {
  addOns: AddOnOption[];
  selected: Record<string, number>; // addOnId -> quantity
  onChange: (addOnId: string, quantity: number) => void;
  currency?: string;
}

/** Checkbox + quantity stepper for each available add-on. */
export function AddOnPicker({ addOns, selected, onChange, currency = 'CAD' }: AddOnPickerProps) {
  if (addOns.length === 0) return null;

  return (
    <fieldset className="space-y-3">
      <legend className="field-label">Dịch vụ bổ sung</legend>
      {addOns.map((addOn) => {
        const quantity = selected[addOn.addOnId] ?? 0;
        const checked = quantity > 0;
        return (
          <div key={addOn.addOnId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(addOn.addOnId, e.target.checked ? 1 : 0)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[#1565a8]"
              />
              <span>
                {addOn.name}{' '}
                {addOn.priceCents === 0 ? (
                  /miễn phí/i.test(addOn.name) ? null : <span className="font-semibold text-[#087795]">(Miễn phí)</span>
                ) : (
                  <span className="text-slate-400">
                    ({formatMoney(addOn.priceCents, currency)} / {addOn.unitLabel})
                  </span>
                )}
              </span>
            </label>
            {checked && addOn.priceCents > 0 ? (
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={(e) => onChange(addOn.addOnId, Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                aria-label={`${addOn.name} quantity`}
                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
