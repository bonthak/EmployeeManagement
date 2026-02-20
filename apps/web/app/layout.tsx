import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Employee Management',
  description: 'Employee management across web and mobile',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
