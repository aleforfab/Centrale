"use client";

import { FEATURE_OPTIONS, type FeatureId } from "@/lib/timeMachine";

interface FeatureChoicesProps {
  selected: FeatureId[];
  onChange: (features: FeatureId[]) => void;
  disabled?: boolean;
}

export function FeatureChoices({ selected, onChange, disabled }: FeatureChoicesProps) {
  const toggle = (id: FeatureId) => {
    if (disabled) return;
    onChange(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );
  };

  return (
    <div className="tm-features">
      {FEATURE_OPTIONS.map((option) => (
        <label className="tm-feature" key={option.id}>
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={() => toggle(option.id)}
            disabled={disabled}
            aria-label={option.label}
          />
          <span>
            <span className="tm-feature__label">{option.label}</span>
            <span className="tm-feature__desc">{option.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
