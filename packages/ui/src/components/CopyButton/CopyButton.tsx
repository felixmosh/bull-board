import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon } from '../Icons/Check';
import { CopyIcon } from '../Icons/Copy';
import { Button } from '../Button/Button';
import s from './CopyButton.module.css';

interface CopyButtonProps {
  textToCopy: string;
  className?: string;
  tabIndex?: number;
}

export const CopyButton = ({ textToCopy, className, tabIndex }: CopyButtonProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (_err) {
      alert(t('CLIPBOARD.COPY_FAILED'));
    }
  }, [textToCopy, t]);

  return (
    <Button
      onClick={handleCopy}
      className={`${s.copyBtn} ${copied ? s.copied : ''} ${className || ''}`}
      tabIndex={tabIndex}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
};
