import React, { useEffect, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useConnectionFilterStore } from '../../hooks/useConnectionFilterStore';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { EyeIcon } from '../Icons/Eye';
import { EyeOffIcon } from '../Icons/EyeOff';
import s from './ConnectionToggles.module.css';

const URL_PARAM = 'dc';

export const ConnectionToggles = () => {
  const { queues } = useQueues();
  const { disabledConnections, toggleConnection, setDisabledConnections } =
    useConnectionFilterStore();
  const history = useHistory();
  const location = useLocation();
  const initialized = useRef(false);

  const connectionNames = [
    ...new Set(
      (queues || []).map((q) => q.connection).filter((c): c is string => !!c)
    ),
  ];

  // Read URL on first render with available connections
  useEffect(() => {
    if (initialized.current || connectionNames.length < 2) return;
    initialized.current = true;

    const params = new URLSearchParams(location.search);
    const raw = params.get(URL_PARAM);
    if (raw) {
      setDisabledConnections(new Set(raw.split(',')));
    }
  }, [connectionNames.length]);

  // Sync store → URL
  useEffect(() => {
    if (!initialized.current) return;

    const params = new URLSearchParams(location.search);
    if (disabledConnections.size > 0) {
      params.set(URL_PARAM, [...disabledConnections].join(','));
    } else {
      params.delete(URL_PARAM);
    }
    history.replace({ ...location, search: params.toString() });
  }, [disabledConnections]);

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
