import React from 'react';
import s from './Title.module.css';

interface TitleProps {
  name?: string;
  description?: string;
}

export const Title = ({ name, description }: TitleProps) => (
  <div className={s.queueTitle}>
    {!!name && (
      <>
        <h1 className={s.name}>{name}</h1>
        {!!description && <p className={s.description}>{description}</p>}
      </>
    )}
  </div>
);
