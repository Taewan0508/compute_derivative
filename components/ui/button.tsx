import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground hover:bg-accent/90',
        outline: 'border border-line bg-panel text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/**
 * Button used for terminal actions, plus the class map behind it.
 *
 * `Button` renders a `<button>`, or the child element when `asChild` is true.
 * `variant` is `default` (accent fill), `outline`, or `ghost`. `size` is
 * `default`, `sm`, or `icon`. Extra `className` values are merged with `cn`.
 * `buttonVariants` returns those classes without rendering an element.
 */
export { Button, buttonVariants }
