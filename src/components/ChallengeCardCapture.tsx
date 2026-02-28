/**
 * Renders a challenge "info card" at fixed 1080px width for html2canvas capture.
 * Used only in Gallery for "Download Card" PNG export.
 */
import { forwardRef } from 'react';

export interface ChallengeCardCaptureProps {
  title: string;
  date: string;
  location: string;
  caption: string;
  /** Data URLs for up to 3 photos (avoids CORS in html2canvas). */
  imageDataUrls: string[];
  /** Optional footer text. */
  footer?: string;
}

const CARD_BG = '#FAF7F2';
const CARD_WIDTH = 1080;

export const ChallengeCardCapture = forwardRef<HTMLDivElement, ChallengeCardCaptureProps>(
  function ChallengeCardCapture(
    { title, date, location, caption, imageDataUrls, footer = '✨ My Cute Journey' },
    ref
  ) {
  const photos = imageDataUrls.slice(0, 3);

  return (
    <div
      ref={ref}
      style={{
        width: CARD_WIDTH,
        backgroundColor: CARD_BG,
        padding: 48,
        boxSizing: 'border-box',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 42,
          fontWeight: 700,
          color: '#1a1a1a',
          marginBottom: 16,
        }}
      >
        {title}
      </h2>
      {(date || location) && (
        <p
          style={{
            margin: 0,
            fontSize: 24,
            color: '#666',
            marginBottom: caption ? 12 : 24,
          }}
        >
          {date && `📅 ${date} `}
          {location && `📍 ${location}`}
        </p>
      )}
      {caption && (
        <p
          style={{
            margin: 0,
            fontSize: 26,
            color: '#444',
            lineHeight: 1.4,
            marginBottom: 24,
          }}
        >
          {caption}
        </p>
      )}
      {photos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${photos.length}, 1fr)`,
            gap: 16,
            marginBottom: 24,
          }}
        >
          {photos.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              style={{
                width: '100%',
                aspectRatio: '1',
                objectFit: 'cover',
                borderRadius: 12,
                display: 'block',
              }}
            />
          ))}
        </div>
      )}
      {footer && (
        <p
          style={{
            margin: 0,
            fontSize: 20,
            color: '#999',
            textAlign: 'center',
          }}
        >
          {footer}
        </p>
      )}
    </div>
  );
});

export const CARD_CAPTURE_WIDTH = CARD_WIDTH;
export const CARD_CAPTURE_BG = CARD_BG;
