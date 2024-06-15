import React from 'react';
import s from './Progress.module.css';
import cn from 'clsx';
import { Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';

const radius = 65;
const circumference = 2 * Math.PI * radius;

interface ProgressProps {
  percentage: number;
  status: Status;
  className?: string;
}

export const Progress = ({ percentage, status, className }: ProgressProps) => {
  const circleProps = {
    cx: 70,
    cy: 70,
    r: radius,
  };
  return (
    <svg className={cn(s.progress, className)} viewBox="0 0 140 140">
      <circle stroke="#E5E7EB" {...circleProps} />
      <circle
        stroke={status === STATUSES.failed ? '#F56565' : '#48BB78'}
        strokeDasharray={circumference}
        strokeDashoffset={circumference - (circumference * percentage) / 100}
        style={{ transform: 'rotate(-90deg)' }}
        {...circleProps}
      />
      <text textAnchor="middle" x="74" y="88">
        {Math.round(percentage)}%
      </text>
    </svg>
  );
};
