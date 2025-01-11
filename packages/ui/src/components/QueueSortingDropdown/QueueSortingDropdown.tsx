import { QueueSortKey, UIConfig } from '@bull-board/api/typings/app';
import { Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { SortIcon } from '../Icons/Sort';
import { Button } from '../Button/Button';

type QueueSortingDropdownProps = {
  sortOptions: UIConfig['queueSortOptions'];
  className: string;
  sortHandler: (sortKey: QueueSortKey) => void;
};

export const QueueSortingDropdown = ({ sortOptions = [], className, sortHandler }: QueueSortingDropdownProps) => {
  const [selectedSort, setSelectedSort] = React.useState(sortOptions[0].key);

  return (
    <Root>
      <Trigger asChild>
        <Button className={className}>
          <SortIcon />
          {sortOptions.find((option) => option.key === selectedSort)?.label}
        </Button>
      </Trigger>

      <Portal>
        <DropdownContent align="end">
          {sortOptions.map((option) => (
            <Item key={option.key} asChild onSelect={() => {
              setSelectedSort(option.key);
              sortHandler(option.key as QueueSortKey);
            }}>
              <p>{option.label}</p>
            </Item>
          ))}
        </DropdownContent>
      </Portal>
    </Root>
  );
};
