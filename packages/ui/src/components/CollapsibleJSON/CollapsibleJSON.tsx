import React, { useCallback, useRef, useState } from 'react';
import { JsonView, collapseAllNested } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { CheckIcon } from '../Icons/Check';
import { CopyIcon } from '../Icons/Copy';
import { Button } from '../Button/Button';
import s from './CollapsibleJSON.module.css';

interface CollapsibleJSONProps {
  data: any;
  defaultCollapseDepth?: number;
}

const customStyles = {
  container: s.container,
  basicChildStyle: s.basicChildStyle,
  collapseIcon: s.collapseIcon,
  expandIcon: s.expandIcon,
  collapsedContent: s.collapsedContent,
  label: s.label,
  clickableLabel: s.label,
  punctuation: s.punctuation,
  stringValue: s.stringValue,
  numberValue: s.numberValue,
  booleanValue: s.booleanValue,
  nullValue: s.nullValue,
  undefinedValue: s.undefinedValue,
  otherValue: s.otherValue,
  noQuotesForStringValues: false,
};

export const CollapsibleJSON: React.FC<CollapsibleJSONProps> = ({
  data,
  defaultCollapseDepth = 3,
}) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [data]);

  const shouldExpandNode = useCallback(
    (level: number) => {
      if (defaultCollapseDepth === 0) {
        return collapseAllNested(level);
      }
      return level < defaultCollapseDepth;
    },
    [defaultCollapseDepth]
  );

  return (
    <div className={s.root}>
      <div className={s.content}>
        <JsonView
          data={data}
          shouldExpandNode={shouldExpandNode}
          style={customStyles}
        />
      </div>
      <Button onClick={handleCopy} className={copied ? `${s.copyBtn} ${s.copied}` : s.copyBtn}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
};
