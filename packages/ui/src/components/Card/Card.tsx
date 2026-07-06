import cn from 'clsx';
import { PropsWithChildren } from 'react';
import s from './Card.module.css';

interface ICardProps {
  className?: string;
}
export const Card = ({ children, className }: PropsWithChildren<ICardProps>) => (
  <div className={cn(s.card, className)}>{children}</div>
);
