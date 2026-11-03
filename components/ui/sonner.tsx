import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from '@/lib/theme';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-emerald-500" />,
        info: <InfoIcon className="size-4 text-sky-500" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-500" />,
        error: <OctagonXIcon className="size-4 text-rose-500" />,
        loading: <Loader2Icon className="text-primary size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            'cn-toast font-sans text-xs shadow-lg border border-border/60 bg-popover/95 backdrop-blur-md',
          actionButton:
            'bg-primary text-primary-foreground text-xs font-medium px-2.5 py-1 rounded-md hover:bg-primary/90',
          cancelButton: 'bg-muted text-muted-foreground text-xs px-2 py-1 rounded-md',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
