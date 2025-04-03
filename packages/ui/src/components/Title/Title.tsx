import React from 'react';
import s from './Title.module.css';
import { useActiveQueue } from '../../hooks/useActiveQueue';

export const Title = () => {
  const queue = useActiveQueue();

  if (!queue) return <div />;

  return (
    <div className={s.queueTitle}>
      {queue.displayName && (
        <>
          <h1 className={s.name}>{queue.displayName}</h1>
          {queue.description && <p className={s.description}>{queue.description}</p>}
        </>
      )}
    </div>
  );
};
