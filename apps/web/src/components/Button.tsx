import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

interface BaseProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'light' | 'text';
  size?: 'regular' | 'small';
  className?: string;
}
type ButtonProps = BaseProps &
  (
    | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & { to?: never })
    | (Omit<LinkProps, 'children' | 'className'> & { to: string })
  );

export function Button({
  variant = 'primary',
  size = 'regular',
  className = '',
  ...props
}: ButtonProps) {
  const classes = `btn market-button market-button--${variant} market-button--${size} ${className}`;
  if (typeof props.to === 'string') {
    const { to, children, ...rest } = props;
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  const { children, type = 'button', ...rest } = props;
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
