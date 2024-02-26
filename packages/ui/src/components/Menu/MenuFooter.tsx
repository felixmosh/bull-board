import cn from 'clsx';
import React from 'react';
import { useRedisOptions } from '../../hooks/useRedisOptions';
import s from './Menu.module.css';

export const MenuFooter = () => {
  const options = useRedisOptions();

  return (
    <div>
      {options && (
        <p className={s.redisOpts}>
          {`${options.host}:${options.port}:${options.db}`}
        </p>
      )}
      <div className={cn(s.appVersion, s.secondary)}>
        {process.env.APP_VERSION}
      </div>
    </div>
  );
};
