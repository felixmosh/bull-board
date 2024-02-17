import cn from 'clsx';
import React, { useEffect, useState } from 'react';
import { asyncHighlight } from '../../utils/highlight/highlight';
import s from './Highlight.module.css';
import { Button } from '../Button/Button';
import { CopyIcon } from '../Icons/Copy';

interface HighlightProps {
  language: 'json' | 'stacktrace';
  code: string | null;
}

export const Highlight: React.FC<HighlightProps> = ({ language, code }) => {
  const [highlightedCode, setHighlightedCode] = useState<string>('');

  const highlightCode = async () => {
    setHighlightedCode(await asyncHighlight(code as string, language));
  };

  useEffect(() => {
    highlightCode();
  }, []);

  useEffect(() => {
    highlightCode();
  }, [language, code]);

  const handleCopyClick = () => {
    navigator.clipboard.writeText(code ?? '');
  };

  return (
    <div className={s.codeContainerWrapper}>
      <pre>
        <code className={cn('hljs', language)} dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>

      <Button
        onClick={handleCopyClick}
        className={s.copyBtn}
      >
        <CopyIcon />
      </Button>
    </div>
  );
};
