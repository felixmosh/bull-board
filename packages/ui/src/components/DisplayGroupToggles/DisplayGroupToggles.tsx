import React, { useEffect, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useDisplayGroupFilterStore } from '../../hooks/useDisplayGroupFilterStore';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { EyeIcon } from '../Icons/Eye';
import { EyeOffIcon } from '../Icons/EyeOff';
import s from './DisplayGroupToggles.module.css';

const URL_PARAM = 'dg';

export const DisplayGroupToggles = () => {
  const { queues } = useQueues();
  const { disabledDisplayGroups, toggleDisplayGroup, setDisabledDisplayGroups } =
    useDisplayGroupFilterStore();
  const history = useHistory();
  const location = useLocation();
  const initialized = useRef(false);

  const displayGroupNames = [
    ...new Set(
      (queues || []).map((q) => q.displayGroup).filter((g): g is string => !!g)
    ),
  ];

  // Read URL on first render with available display groups
  useEffect(() => {
    if (initialized.current || displayGroupNames.length < 2) return;
    initialized.current = true;

    const params = new URLSearchParams(location.search);
    const raw = params.get(URL_PARAM);
    if (raw) {
      setDisabledDisplayGroups(new Set(raw.split(',')));
    }
  }, [displayGroupNames.length]);

  // Sync store → URL
  useEffect(() => {
    if (!initialized.current) return;

    const params = new URLSearchParams(location.search);
    if (disabledDisplayGroups.size > 0) {
      params.set(URL_PARAM, [...disabledDisplayGroups].join(','));
    } else {
      params.delete(URL_PARAM);
    }
    history.replace({ ...location, search: params.toString() });
  }, [disabledDisplayGroups]);

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
