'use client';

import React from 'react';
import Head from 'next/head';

type Props = { hrefs: string[] };

/** HeartsGardenのステージ画像をプリロードして初回体験をなめらかに */
export default function PreloadHeartGardenImages({ hrefs }: Props) {
  return (
    <Head>
      {hrefs.map((href) => (
        <link key={href} rel="preload" as="image" href={href} />
      ))}
    </Head>
  );
}
