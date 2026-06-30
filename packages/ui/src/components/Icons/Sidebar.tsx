import React from 'react';

export const SidebarIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    role="img"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    className={className}
  >
    <path d="M64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zM48 96c0-8.8 7.2-16 16-16H176V432H64c-8.8 0-16-7.2-16-16V96zM224 432V80H448c8.8 0 16 7.2 16 16V416c0 8.8-7.2 16-16 16H224z" />
  </svg>
);
