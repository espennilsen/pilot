import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantStyles = {
    primary: 'bg-[var(--color-accent)] text-[var(--color-bg-base)] hover:brightness-110 active:brightness-95',
    secondary: 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]',
    ghost: 'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]',
    danger: 'bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] text-[var(--color-error)] hover:bg-[color-mix(in_srgb,var(--color-error)_20%,transparent)]',
  };
  
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm rounded-[var(--radius-sm)]',
    md: 'px-4 py-2 text-base rounded-[var(--radius-md)]',
    lg: 'px-6 py-3 text-lg rounded-[var(--radius-lg)]',
  };
  
  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  );
}
