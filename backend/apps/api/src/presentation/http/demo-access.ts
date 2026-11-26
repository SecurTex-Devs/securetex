import { SetMetadata } from '@nestjs/common';

export const DEMO_ACCESS_KEY = 'securtex:demo-access';
/** La demo se deniega por defecto, también en endpoints que admiten usuarios normales. */
export const AllowDemo = () => SetMetadata(DEMO_ACCESS_KEY, true);
