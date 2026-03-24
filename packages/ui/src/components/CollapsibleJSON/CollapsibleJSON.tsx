import React, { useCallback, useMemo } from 'react';
import { JsonView, collapseAllNested } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { CopyButton } from '../CopyButton/CopyButton';
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
  const textToCopy = useMemo(() => JSON.stringify(data, null, 2), [data]);

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
      <CopyButton textToCopy={textToCopy} className={s.copyBtn} />
    </div>
  );
};
