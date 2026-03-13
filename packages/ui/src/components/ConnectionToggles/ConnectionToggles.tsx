import React from 'react';
import { useConnectionFilterStore } from '../../hooks/useConnectionFilterStore';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import s from './ConnectionToggles.module.css';

export const ConnectionToggles = () => {
  const { queues } = useQueues();
  const { disabledConnections, toggleConnection } = useConnectionFilterStore();

  const connectionNames = [
    ...new Set(
      (queues || []).map((q) => q.connection).filter((c): c is string => !!c)
    ),
  ];

  if (connectionNames.length < 2) return null;

  return (
    <div className={s.wrapper}>
      {connectionNames.map((name) => (
        <Button
          key={name}
          isActive={!disabledConnections.has(name)}
          theme="basic"
          onClick={() => toggleConnection(name)}
        >
          {name}
        </Button>
      ))}
    </div>
  );
};
