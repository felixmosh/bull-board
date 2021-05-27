import { ViewHandlerReturnType } from '../../typings/app';

export function entryPoint(): ViewHandlerReturnType {
  return { name: 'index.ejs' };
}
