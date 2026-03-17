import React from 'react';
import { useDisplayGroupFilterStore } from '../../hooks/useDisplayGroupFilterStore';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { EyeIcon } from '../Icons/Eye';
import { EyeOffIcon } from '../Icons/EyeOff';
import s from './DisplayGroupToggles.module.css';

export const DisplayGroupToggles = () => {
  const { queues } = useQueues();
  const { disabledDisplayGroups, toggleDisplayGroup } = useDisplayGroupFilterStore();

  const displayGroupNames = [
    ...new Set(
      (queues || []).map((q) => q.displayGroup).filter((g): g is string => !!g)
    ),
  ];

  if (displayGroupNames.length < 2) return null;

  return (
    <div className={s.wrapper}>
      {displayGroupNames.map((name) => {
        const enabled = !disabledDisplayGroups.has(name);
        return (
          <Button
            key={name}
            isActive={enabled}
            theme="basic"
            onClick={(e) => toggleDisplayGroup(name, displayGroupNames, e.metaKey)}
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
