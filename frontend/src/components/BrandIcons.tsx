import React from 'react';

export const AnavyaLogo: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="9" fill="#1F1F1F" />
    <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.25" stroke="#E9A23B" strokeOpacity="0.45" strokeWidth="1.5" />
    <path
      d="M16 6.5L24.5 23.5H19.8L16 15.4L12.2 23.5H7.5L16 6.5Z"
      fill="url(#anavya_grad)"
    />
    <circle cx="16" cy="21.5" r="2.2" fill="#36C99A" />
    <defs>
      <linearGradient id="anavya_grad" x1="8" y1="7" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F59E0B" />
        <stop offset="1" stopColor="#EA580C" />
      </linearGradient>
    </defs>
  </svg>
);

export const GoogleSheetsIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.5 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V7.5L14.5 2Z"
      fill="#0F9D58"
    />
    <path d="M14.5 2V7.5H20L14.5 2Z" fill="#87CEAC" />
    <path
      d="M7.5 11.5H16.5V18.5H7.5V11.5ZM9 13V14.5H11.5V13H9ZM12.5 13V14.5H15V13H12.5ZM9 15.5V17H11.5V15.5H9ZM12.5 15.5V17H15V15.5H12.5Z"
      fill="white"
    />
  </svg>
);

export const GoogleDocsIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.5 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V7.5L14.5 2Z"
      fill="#4285F4"
    />
    <path d="M14.5 2V7.5H20L14.5 2Z" fill="#A1C2FA" />
    <path
      d="M8 12H16V13.3H8V12ZM8 14.5H16V15.8H8V14.5ZM8 17H13V18.3H8V17Z"
      fill="white"
    />
  </svg>
);

export const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path d="M8.5 3.5L15.5 3.5L22 14.8L15 14.8L8.5 3.5Z" fill="#FFBA00" />
    <path d="M2 14.8L8.5 3.5L12 9.5L5.5 20.5L2 14.8Z" fill="#0066DA" />
    <path d="M5.5 20.5L9 14.8L22 14.8L18.5 20.5L5.5 20.5Z" fill="#00AC47" />
  </svg>
);

export const GmailIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="20" height="16" rx="2.5" fill="#FFFFFF" />
    <path d="M4.5 6.5L12 12.2L19.5 6.5" stroke="#EA4335" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.5 6.5V17.5" stroke="#4285F4" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M20.5 6.5V17.5" stroke="#34A853" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const TelegramIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#2AABEE" />
    <path
      d="M16.9 7.6L14.9 17.1C14.7 17.8 14.3 18 13.7 17.6L10.7 15.4L9.2 16.8C9 17 8.9 17.1 8.5 17.1L8.8 14L14.4 8.9C14.6 8.7 14.3 8.6 14 8.8L7.1 13.1L4.1 12.2C3.5 12 3.5 11.5 4.3 11.2L16 6.7C16.6 6.5 17.1 6.9 16.9 7.6Z"
      fill="white"
    />
  </svg>
);

export const resolveAppIdentity = (
  toolOrAppName?: string
): {
  appName: 'Google Sheets' | 'Google Docs' | 'Google Drive' | 'Gmail' | 'Telegram' | 'Anavya Workspace';
  badgeColor: string;
} => {
  const lower = (toolOrAppName || '').toLowerCase();
  if (lower.includes('sheet') || lower.includes('csv')) {
    return { appName: 'Google Sheets', badgeColor: '#0F9D58' };
  }
  if (lower.includes('doc') || lower.includes('file_writer')) {
    return { appName: 'Google Docs', badgeColor: '#4285F4' };
  }
  if (lower.includes('drive')) {
    return { appName: 'Google Drive', badgeColor: '#FFBA00' };
  }
  if (lower.includes('gmail') || lower.includes('email')) {
    return { appName: 'Gmail', badgeColor: '#EA4335' };
  }
  if (lower.includes('telegram')) {
    return { appName: 'Telegram', badgeColor: '#2AABEE' };
  }
  return { appName: 'Anavya Workspace', badgeColor: '#E9A23B' };
};

export const ApplicationIcon: React.FC<{
  appOrTool?: string;
  className?: string;
}> = ({ appOrTool, className = 'w-5 h-5' }) => {
  const { appName } = resolveAppIdentity(appOrTool);
  switch (appName) {
    case 'Google Sheets':
      return <GoogleSheetsIcon className={className} />;
    case 'Google Docs':
      return <GoogleDocsIcon className={className} />;
    case 'Google Drive':
      return <GoogleDriveIcon className={className} />;
    case 'Gmail':
      return <GmailIcon className={className} />;
    case 'Telegram':
      return <TelegramIcon className={className} />;
    default:
      return <AnavyaLogo className={className} />;
  }
};

