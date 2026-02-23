import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({
  label,
  error,
  icon,
  className = '',
  ...props
}: InputProps) {
  const inputId = React.useId();
  
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label 
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full px-3 py-2 
            bg-[var(--color-bg-surface)] 
            border border-[var(--color-border)] 
            text-[var(--color-text-primary)] 
            rounded-[var(--radius-md)]
            placeholder:text-[var(--color-text-secondary)]
            focus:outline-none 
            focus:border-[var(--color-accent)] 
            focus:ring-1 
            focus:ring-[color-mix(in_srgb,var(--color-accent)_30%,transparent)]
            disabled:opacity-50 
            disabled:cursor-not-allowed
            transition-colors
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[color-mix(in_srgb,var(--color-error)_30%,transparent)]' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <span className="text-sm text-[var(--color-error)]">
          {error}
        </span>
      )}
    </div>
  );
}
