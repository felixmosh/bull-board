import React from 'react';
import s from './Progress.module.css';
import cn from 'clsx';
import { Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';

type IProgress = number | { progress?: number } | string | boolean | null;

interface ProgressProps {
  progress: IProgress;
  strokeWidth?: number;
  status: Status;
  className?: string;
}

function extractPercentage(progress: IProgress) {
  if (typeof progress === 'number') {
    return progress;
  } else if (typeof progress === 'string') {
    return Number.isNaN(+progress) ? null : +progress;
  } else if (
    !!progress &&
    typeof progress !== 'boolean' &&
    'progress' in progress &&
    typeof progress.progress === 'number'
  ) {
    return progress.progress;
  }

  return null;
}

export const Progress = ({ progress, status, className, strokeWidth = 6 }: ProgressProps) => {
  const percentage = extractPercentage(progress);
  if (!percentage) {
    return null;
  }

  const commonProps = {
    cx: '50%',
    cy: '50%',
    r: `calc(50% - ${strokeWidth / 2}px)`,
    strokeWidth,
    ['transform-origin']: 'center',
  };

  return (
    <svg className={cn(s.progress, className)} width="100%" height="100%">
      <circle {...commonProps} />
      <circle
        className={cn({
          [s.failed]: status === STATUSES.failed,
          [s.success]: status !== STATUSES.failed,
        })}
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={100 - percentage}
        strokeLinejoin="round"
        strokeLinecap="round"
        transform="rotate(-90)"
        {...commonProps}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
        <tspan dominantBaseline="central">{`${Math.round(percentage)}%`}</tspan>
      </text>
    </svg>
  );
};
