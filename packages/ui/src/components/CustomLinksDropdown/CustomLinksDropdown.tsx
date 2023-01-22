import { UIConfig } from '@bull-board/api/dist/typings/app';
import { Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import React from 'react';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { UserIcon } from '../Icons/User';
import { Button } from '../JobCard/Button/Button';

type CustomLinksDropdownProps = {
  options: UIConfig['miscLinks'];
  className: string;
};

export const CustomLinksDropdown = ({ options = [], className }: CustomLinksDropdownProps) => {
  return (
    <Root>
      <Trigger asChild>
        <Button className={className}>
          <UserIcon />
        </Button>
      </Trigger>

      <Portal>
        <DropdownContent align="end">
          {options.map((option) => (
            <Item key={option.url} asChild>
              <a href={option.url}>{option.text}</a>
            </Item>
          ))}
        </DropdownContent>
      </Portal>
    </Root>
  );
};
