import React, { useState, useCallback } from 'react';
import { ChevronDown } from '../Icons/ChevronDown';
import { ChevronRight } from '../Icons/ChevronRight';
import { CopyIcon } from '../Icons/Copy';
import { Button } from '../Button/Button';
import s from './CollapsibleJSON.module.css';

interface CollapsibleJSONProps {
  data: any;
  defaultCollapseDepth?: number;
  currentDepth?: number;
}

interface PropertyItemProps {
  propertyKey: string;
  value: any;
  defaultCollapseDepth: number;
  currentDepth: number;
}

const PropertyItem: React.FC<PropertyItemProps> = ({
  propertyKey,
  value,
  defaultCollapseDepth,
  currentDepth,
}) => {
  const isValueCollapsible = typeof value === 'object' && value !== null;
  const isValueArray = Array.isArray(value);
  const isValueEmpty = isValueCollapsible && (isValueArray ? value.length === 0 : Object.keys(value).length === 0);
  const shouldBeInline = !isValueCollapsible || isValueEmpty;

  const [collapsed, setCollapsed] = useState(
    isValueCollapsible && !isValueEmpty && currentDepth >= defaultCollapseDepth
  );

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const renderCollapsedPreview = () => {
    if (isValueArray) {
      return `${value.length} items`;
    }
    const keys = Object.keys(value);
    return keys.length > 0 ? `${keys.length} props` : '';
  };

  if (shouldBeInline) {
    return (
      <div key={propertyKey} className={s.propertyInline}>
        <span className={s.key}>"{propertyKey}":</span>
        <CollapsibleJSON
          data={value}
          defaultCollapseDepth={defaultCollapseDepth}
          currentDepth={currentDepth}
        />
      </div>
    );
  }

  return (
    <div key={propertyKey} className={s.propertyWithToggle}>
      <div className={s.propertyLine}>
        <button onClick={handleToggle} className={s.toggle}>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </button>
        <span className={s.key}>"{propertyKey}":</span>
        {collapsed ? (
          <span className={s.inlineNested}>
            <span className={s.bracket}>{isValueArray ? '[' : '{'}</span>
            <span className={s.preview}>{renderCollapsedPreview()}</span>
            <span className={s.bracket}>{isValueArray ? ']' : '}'}</span>
          </span>
        ) : (
          <span className={s.bracket}>{isValueArray ? '[' : '{'}</span>
        )}
      </div>
      {!collapsed && (
        <>
          <div className={s.children}>
            <CollapsibleJSON
              data={value}
              defaultCollapseDepth={defaultCollapseDepth}
              currentDepth={currentDepth}
            />
          </div>
          <div className={s.closeBracket}>
            <span className={s.bracket}>{isValueArray ? ']' : '}'}</span>
          </div>
        </>
      )}
    </div>
  );
};

export const CollapsibleJSON: React.FC<CollapsibleJSONProps> = ({
  data,
  defaultCollapseDepth = 2,
  currentDepth = 0,
}) => {
  const isCollapsible = typeof data === 'object' && data !== null;
  const isArray = Array.isArray(data);
  const isEmpty = isCollapsible && (isArray ? data.length === 0 : Object.keys(data).length === 0);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }, [data]);

  const renderPrimitive = (value: any) => {
    if (value === null) return <span className={s.null}>null</span>;
    if (value === undefined) return <span className={s.undefined}>undefined</span>;
    if (typeof value === 'boolean') return <span className={s.boolean}>{String(value)}</span>;
    if (typeof value === 'number') return <span className={s.number}>{value}</span>;
    if (typeof value === 'string') return <span className={s.string}>"{value}"</span>;
    return <span>{String(value)}</span>;
  };


  const renderContent = () => {
    if (!isCollapsible) {
      return renderPrimitive(data);
    }

    if (isArray) {
      return (
        <>
          {data.map((item: any, index: number) => (
            <div key={index} className={s.arrayItem}>
              <span className={s.index}>{index}:</span>
              <CollapsibleJSON
                data={item}
                defaultCollapseDepth={defaultCollapseDepth}
                currentDepth={currentDepth + 1}
              />
            </div>
          ))}
          {data.length === 0 && <span className={s.empty}>[]</span>}
        </>
      );
    }

    const entries = Object.entries(data);
    return (
      <>
        {entries.map(([key, value]) => {
          return (
            <PropertyItem
              propertyKey={key}
              value={value}
              defaultCollapseDepth={defaultCollapseDepth}
              currentDepth={currentDepth + 1}
            />
          );
        })}
      </>
    );
  };

  if (currentDepth === 0) {
    return (
      <div className={s.root}>
        <div className={s.content}>
          {isCollapsible ? (
            <div>
              <div className={s.rootLevel}>
                <span className={s.bracket}>{isArray ? '[' : '{'}</span>
              </div>
              <div className={s.children}>{renderContent()}</div>
              <span className={s.bracket}>{isArray ? ']' : '}'}</span>
            </div>
          ) : (
            renderContent()
          )}
        </div>
        <Button onClick={handleCopy} className={s.copyBtn}>
          <CopyIcon />
        </Button>
      </div>
    );
  }

  if (!isCollapsible) {
    return <span className={s.value}>{renderPrimitive(data)}</span>;
  }

  if (isEmpty) {
    return <span className={s.value}>{isArray ? '[]' : '{}'}</span>;
  }

  // For nested rendering within arrays or already expanded objects
  return <>{renderContent()}</>;
};