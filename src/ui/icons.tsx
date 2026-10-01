const paths: Record<string, string> = {
  close: 'M18 6 6 18M6 6l12 12',
  back: 'M15 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  api: 'M9 5v6M12 5v6M6 8h6M5 21a4 4 0 0 0 4-4V9m10 12a4 4 0 0 1-4-4v-2m4 0h-4m-6 6h1',
  warn: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
}

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.api} />
    </svg>
  )
}
