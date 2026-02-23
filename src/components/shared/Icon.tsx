import type { LucideProps } from 'lucide-react';
import * as icons from 'lucide-react';

interface IconProps extends Omit<LucideProps, 'ref'> {
  name: keyof typeof icons;
}

export function Icon({ name, size = 16, ...props }: IconProps) {
  const LucideIcon = icons[name] as React.ComponentType<LucideProps>;
  if (!LucideIcon) {
    console.warn(`Icon "${name}" not found in lucide-react`);
    return null;
  }
  return <LucideIcon size={size} {...props} />;
}
