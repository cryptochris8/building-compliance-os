import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free LL97 Penalty Calculator | Building Compliance OS',
  description:
    'Calculate your NYC Local Law 97 penalty in 30 seconds. Enter your building details and get an instant emissions estimate.',
  openGraph: {
    title: 'Free LL97 Penalty Calculator | Building Compliance OS',
    description:
      'Calculate your NYC Local Law 97 penalty in 30 seconds.',
    type: 'website',
  },
};

export default function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
