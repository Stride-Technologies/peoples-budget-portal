import { forwardRef, InputHTMLAttributes, useCallback } from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'checked'> {
  /**
   * `'indeterminate'` renders the native mixed state — a partially selected
   * group. It reads as unchecked for form purposes, which is why callers pass
   * `true` to the change handler to mean "select all".
   */
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
      onChange?.(e);
    };

    // `indeterminate` is a DOM property with no HTML attribute, so it can only
    // be set on the element itself. A callback ref keeps that in sync without
    // an effect, and still forwards to any ref the caller passed.
    const setRef = useCallback(
      (el: HTMLInputElement | null) => {
        if (el) el.indeterminate = checked === 'indeterminate';
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      },
      [checked, ref],
    );

    return (
      <input
        type="checkbox"
        ref={setRef}
        checked={checked === true}
        onChange={handleChange}
        className={cn(
          'h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600',
          className
        )}
        {...props}
      />
    );
  }
);

Checkbox.displayName = 'Checkbox';
