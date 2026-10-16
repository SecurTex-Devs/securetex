'use client';

import { Laptop, Moon, Sun } from 'lucide-react';
import { getT } from '@/shared/i18n';
import { IconButton } from '@/shared/ui/button';
import { Menu, MenuItem } from '@/shared/ui/menu';
import { useTheme, type ThemeChoice } from './theme';

const ICON = { light: Sun, dark: Moon, system: Laptop } as const;

export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const t = getT('common');
  const Current = ICON[choice];
  const options: readonly ThemeChoice[] = ['light', 'dark', 'system'];
  return (
    <Menu label={t('theme.toggle')} trigger={<IconButton label={t('theme.toggle')} size="sm" icon={<Current className="size-4" strokeWidth={1.5} />} />}>
      {options.map((o) => {
        const Icon = ICON[o];
        return (
          <MenuItem key={o} icon={<Icon strokeWidth={1.5} />} onSelect={() => setChoice(o)}>
            <span className={choice === o ? 'font-medium text-fg' : undefined}>{t(`theme.${o}`)}</span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}
