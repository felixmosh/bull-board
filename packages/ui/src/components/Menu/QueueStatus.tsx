import React from 'react';

import { Status } from '@bull-board/api/typings/app';
import s from './QueueStatus.module.css';

const formatSmallNumber = (i: number) => {
  if (i < 100) return `${i}`;
  if (i < 1_000) return `${Math.floor(i / 100)}h`;
  if (i < 10_000) return `${Math.floor(i / 1000)}k`;
  if (i < 100_000) return `e4`;
  if (i < 1_000_000) return `e5`;
  if (i < 10_000_000) return `e6`;
  return `>e6`;
};

export const QueueStatus = ({ counts }: { counts: Record<Status, number> }) => {
  return (
    <table className={s.table}>
      <tbody>
        <tr>
          <td style={{ color: 'greenyellow' }}>{formatSmallNumber(counts.active)}</td>
          <td style={{ color: 'lightgreen' }}>{formatSmallNumber(counts.completed)}</td>
          <td style={{ color: 'gray' }}>{formatSmallNumber(counts.paused)}</td>
        </tr>
        <tr>
          <td style={{ color: 'lightblue' }}>{formatSmallNumber(counts.delayed)}</td>
          <td style={{ color: 'yellow' }}>{formatSmallNumber(counts.waiting)}</td>
          <td style={{ color: 'red' }}>{formatSmallNumber(counts.failed)}</td>
        </tr>
      </tbody>
    </table>
  );
};
