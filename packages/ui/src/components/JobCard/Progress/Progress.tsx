import React from 'react';
import s from './Progress.module.css';
import cn from 'clsx';
import { Status } from '@wirdo-bullboard/api/typings/app';
import { STATUSES } from '@wirdo-bullboard/api/src/constants/statuses';

export const Progress = ({
  percentage,
  status,
  className,
}: {
  percentage: number;
  status: Status;
  className?: string;
}) => (
  <svg className={cn(s.progress, className)} viewBox="0 0 140 140">
    <circle
      cx="70"
      cy="70"
      r="65"
      fill="none"
      stroke="#E5E7EB"
      strokeWidth="8"
      strokeLinecap="round"
    ></circle>
    <circle
      cx="70"
      cy="70"
      r="65"
      fill="none"
      stroke={status === STATUSES.failed ? '#F56565' : '#48BB78'}
      strokeWidth="8"
      strokeLinecap="round"
      strokeDasharray="600"
      strokeDashoffset={600 - ((600 - 160) * percentage) / 100}
      style={{ transform: 'rotate(-90deg)' }}
    ></circle>
    <text textAnchor="middle" x="74" y="88">
      {percentage}%
    </text>
  </svg>
);
