"use client";

import { InputHTMLAttributes, forwardRef, SelectHTMLAttributes, ReactNode } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  function Input({ label, className = "", id, ...props }, ref) {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`rounded-lg bg-slate-800/80 border border-slate-700 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/60 focus:border-sky-500 ${className}`}
          {...props}
        />
      </div>
    );
  }
);

export const Select = forwardRef
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label?: string; children: ReactNode }
>(function Select({ label, className = "", id, children, ...props }, ref) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={`rounded-lg bg-slate-800/80 border border-slate-700 px-3.5 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/60 focus:border-sky-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});
