import cn from 'clsx';
import { PropsWithChildren, Ref } from 'react';
import s from './Card.module.css';

interface ICardProps {
  className?: string;
  ref?: Ref<HTMLDivElement>;
}
export const Card = ({ children, className, ref }: PropsWithChildren<ICardProps>) => (
  <div ref={ref} className={cn(s.card, className)}>
    {children}
  </div>
);
