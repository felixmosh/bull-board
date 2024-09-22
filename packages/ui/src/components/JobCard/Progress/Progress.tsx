import React from 'react';
import s from './Progress.module.css';
import cn from 'clsx';
import { Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';

interface ProgressProps {
  percentage: number;
  strokeWidth?: number;
  status: Status;
  className?: string;
}

export const Progress = ({ percentage, status, className, strokeWidth = 6 }: ProgressProps) => {
  const commonProps = {
    cx: '50%',
    cy: '50%',
    r: `calc(50% - ${strokeWidth / 2}px)`,
    strokeWidth,
    ['transform-origin']: 'center',
  };
  return (
    <svg className={cn(s.progress, className)} width="100%" height="100%">
      <circle stroke="#E5E7EB" {...commonProps} />
      <circle
        stroke={status === STATUSES.failed ? '#F56565' : '#48BB78'}
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={100 - percentage}
        strokeLinejoin="round"
        strokeLinecap="round"
        transform="rotate(-90)"
        {...commonProps}
      />
      <text textAnchor="middle" dominantBaseline="middle" x="50%" y="50%">
        {Math.round(percentage)}%
      </text>
    </svg>
  );
};
