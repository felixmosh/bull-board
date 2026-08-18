import type { LucideIcon, LucideProps } from 'lucide-react';

export const createIcon = (Icon: LucideIcon) => {
  const Component = (props: LucideProps) => <Icon size="1em" aria-hidden="true" {...props} />;
  Component.displayName = Icon.displayName;
  return Component;
};
