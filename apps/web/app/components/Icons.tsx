import type { SVGProps } from "react"

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const paths: Record<string, React.ReactNode> = {
  activity: (
    <>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  bed: (
    <>
      <path d="M2 18v-7h20v7M2 14h20M6 11V6h6a3 3 0 0 1 3 3v2M5 18v2M19 18v2" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  building: (
    <>
      <path d="M3 21h18M6 21V4h12v17M9 8h2M13 8h2M9 12h2M13 12h2M11 21v-5h2v5" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4 16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l1.5-3h5Z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  check: (
    <>
      <path d="m5 12 4 4L19 6" />
    </>
  ),
  chevron: (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M9 9h6M9 13h6M9 17h4" />
    </>
  ),
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3M10 10h4v4h-4z" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
    </>
  ),
  file: (
    <>
      <path d="M6 2h8l4 4v16H6zM14 2v5h5M9 13h6M9 17h6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  moon: (
    <>
      <path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14Z" />
    </>
  ),
  pencil: (
    <>
      <path d="m4 16-1 5 5-1L19 9l-4-4L4 16ZM13.5 6.5l4 4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6 6M5.5 15A7 7 0 0 0 18 18" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3v6a4 4 0 0 0 8 0V3M4 3h4M12 3h4M10 16a5 5 0 0 0 10 0v-2" />
      <circle cx="20" cy="12" r="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0" />
    </>
  ),
  zap: (
    <>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </>
  ),
}

export function Icon({
  name,
  size = 20,
  ...props
}: IconProps & { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}

// Named helper exports
export const StethoscopeIcon = (props: IconProps) => <Icon name="stethoscope" {...props} />
export const ActivityIcon = (props: IconProps) => <Icon name="activity" {...props} />
export const BedIcon = (props: IconProps) => <Icon name="bed" {...props} />
export const MicrophoneIcon = (props: IconProps) => <Icon name="mic" {...props} />
export const CameraIcon = (props: IconProps) => <Icon name="camera" {...props} />
export const CheckIcon = (props: IconProps) => <Icon name="check" {...props} />
export const AlertCircleIcon = (props: IconProps) => <Icon name="alert" {...props} />
export const ShieldIcon = (props: IconProps) => <Icon name="shield" {...props} />
export const FileTextIcon = (props: IconProps) => <Icon name="file" {...props} />
export const RefreshIcon = (props: IconProps) => <Icon name="refresh" {...props} />
export const UndoIcon = (props: IconProps) => <Icon name="undo" {...props} />
export const ClipboardIcon = (props: IconProps) => <Icon name="clipboard" {...props} />
export const ChevronRightIcon = (props: IconProps) => <Icon name="chevron" {...props} />
export const ChevronDownIcon = (props: IconProps) => <Icon name="chevron" style={{ transform: "rotate(90deg)" }} {...props} />
