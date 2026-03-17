import React from 'react';
import { useConnectionFilterStore } from '../../hooks/useConnectionFilterStore';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { EyeIcon } from '../Icons/Eye';
import { EyeOffIcon } from '../Icons/EyeOff';
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
      {connectionNames.map((name) => {
        const enabled = !disabledConnections.has(name);
        return (
          <Button
            key={name}
            isActive={enabled}
            theme="basic"
            onClick={(e) => toggleConnection(name, connectionNames, e.metaKey)}
          >
            <span className={s.label}>
              {name}
              <span className={s.icon}>{enabled ? <EyeIcon /> : <EyeOffIcon />}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
};
