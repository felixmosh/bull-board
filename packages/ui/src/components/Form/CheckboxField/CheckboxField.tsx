import { Checkbox, type CheckboxRootProps } from '@base-ui/react/checkbox';
import { CheckIcon } from '../../Icons/Check';
import { Field } from '../Field/Field';
import s from './CheckboxField.module.css';

interface CheckboxFieldProps extends CheckboxRootProps {
  label?: string;
  id?: string;
  description?: string;
}

export const CheckboxField = ({ label, id, description, ...checkboxProps }: CheckboxFieldProps) => (
  <Field label={label} id={id} inline={true} description={description}>
    <Checkbox.Root id={id} {...checkboxProps} className={s.checkbox}>
      <Checkbox.Indicator className={s.indicator}>
        <CheckIcon />
      </Checkbox.Indicator>
    </Checkbox.Root>
  </Field>
);
