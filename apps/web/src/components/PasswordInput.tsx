'use client';
import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';

/** Password field with a show/hide button. */
export const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input ref={ref} {...props} type={show ? 'text' : 'password'} className="input pr-12" />
      <button type="button" className="btn ghost sm icon absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} tabIndex={-1}>{show ? <EyeOff /> : <Eye />}</button>
    </span>
  );
});
