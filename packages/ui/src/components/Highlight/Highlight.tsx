import cn from 'clsx';
import React, { useEffect, useState } from 'react';
import { asyncHighlight } from '../../utils/highlight/highlight';
import s from './Highlight.module.css';
import { Button } from '../Button/Button';
import { CopyIcon } from '../Icons/Copy';

interface HighlightProps {
  language: 'json' | 'stacktrace';
  text: string;
}

export const Highlight: React.FC<HighlightProps> = ({ language, text }) => {
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    let unmount = false;
    asyncHighlight(text as string, language).then((newCode) => {
      if (!unmount) {
        setCode(newCode);
      }
    });

    return () => {
      unmount = true;
    };
  }, [language, text]);

  const handleCopyClick = () => {
    navigator.clipboard.writeText(text ?? '');
  };

  return (
    <div className={s.codeContainerWrapper}>
      <pre>
        <code className={cn('hljs', language)} dangerouslySetInnerHTML={{ __html: code }} />
      </pre>

      <Button onClick={handleCopyClick} className={s.copyBtn}>
        <CopyIcon />
      </Button>
    </div>
  );
};
