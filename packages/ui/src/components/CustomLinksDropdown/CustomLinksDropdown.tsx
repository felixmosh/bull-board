import { Menu } from '@base-ui/react/menu';
import type { UIConfig } from '@bull-board/api/typings/app';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { UserIcon } from '../Icons/User';

type CustomLinksDropdownProps = {
  options: UIConfig['miscLinks'];
  className: string;
};

export const CustomLinksDropdown = ({ options = [], className }: CustomLinksDropdownProps) => (
  <Menu.Root>
    <Menu.Trigger
      render={
        <Button className={className}>
          <UserIcon />
        </Button>
      }
    />

    <Menu.Portal>
      <Menu.Positioner align="end" style={{ zIndex: 100 }}>
        <DropdownContent>
          {options.map((option) => (
            <Menu.LinkItem key={option.url} href={option.url} closeOnClick>
              {option.text}
            </Menu.LinkItem>
          ))}
        </DropdownContent>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);
