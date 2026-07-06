import cn from 'clsx';
import { useEffect, useState } from 'react';
import { asyncHighlight } from '../../utils/highlight/highlight';
import { Button } from '../Button/Button';
import { CopyIcon } from '../Icons/Copy';
import s from './Highlight.module.css';

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

      <Button onClick={handleCopyClick} className={s.copyBtn} compact>
        <CopyIcon />
      </Button>
    </div>
  );
};
