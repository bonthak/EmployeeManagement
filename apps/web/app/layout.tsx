import './globals.css';
import { Manrope, Space_Grotesk } from 'next/font/google';
import { Providers } from './providers';

export const metadata = {
  title: 'Employee Management',
  description: 'Employee management across web and mobile',
};

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['500', '700'],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
