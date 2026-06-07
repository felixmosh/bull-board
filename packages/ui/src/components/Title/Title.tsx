import React from 'react';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useMobileQuery } from '../../hooks/useMobileQuery';
import s from './Title.module.css';

export const Title = () => {
  const queue = useActiveQueue();
  const isMobile = useMobileQuery();

  if (!queue || isMobile) return <div />;

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
