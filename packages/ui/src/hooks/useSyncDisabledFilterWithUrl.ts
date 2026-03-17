import { useEffect, useRef } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

export function useSyncDisabledFilterWithUrl(
  urlParam: string,
  availableValues: string[],
  disabledValues: Set<string>,
  setDisabledValues: (disabled: Set<string>) => void
) {
  const history = useHistory();
  const location = useLocation();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || availableValues.length < 2) return;
    initialized.current = true;

    const params = new URLSearchParams(location.search);
    const raw = params.get(urlParam);
    if (raw) {
      setDisabledValues(new Set(raw.split(',')));
    }
  }, [availableValues.length]);

  useEffect(() => {
    if (!initialized.current) return;

    const params = new URLSearchParams(location.search);
    if (disabledValues.size > 0) {
      params.set(urlParam, [...disabledValues].join(','));
    } else {
      params.delete(urlParam);
    }

    history.replace({ ...location, search: params.toString() });
  }, [disabledValues]);
}
