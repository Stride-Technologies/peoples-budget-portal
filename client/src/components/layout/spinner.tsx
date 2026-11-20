"use client";

import React from 'react';

type SpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
};

export default function Spinner({ size = 'md', label = 'Loading...' }: SpinnerProps) {
  const dims = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  return (
    <div className="flex items-center justify-center space-x-3 py-6">
      <div
        className={`${dims} animate-spin rounded-full border-4 border-neutral-200 border-t-amber-500`}
        role="status"
        aria-label={label}
      />
      <span className="text-sm text-neutral-600">{label}</span>
    </div>
  );
}
