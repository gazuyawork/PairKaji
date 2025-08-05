'use client';

export const dynamic = 'force-dynamic'

import MainContent from './MainContent';

export default function FixedHeaderAndMain() {

  return (
    <>
      <div className="pt-16">
        <MainContent />
      </div>
    </>
  );
}
