import { useState, useEffect } from 'react';

interface Props {
  imageId: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  fallbackSrc?: string;
}

interface ImageMetadata {
  url: string;
  width: number;
  height: number;
  contentType: string;
}

import { API_URL } from '../utils/config';
import { FiImage } from 'react-icons/fi';

export default function OptimizedImage({
  imageId,
  alt,
  width,
  height,
  className = '',
  fallbackSrc,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!imageId) {
      setLoading(false);
      setError(true);
      return;
    }

    let cancelled = false;

    fetch(`${API_URL}/api/images/${imageId}/metadata`)
      .then((res) => {
        if (!res.ok) throw new Error('Metadata fetch failed');
        return res.json() as Promise<ImageMetadata>;
      })
      .then((meta) => {
        if (!cancelled) {
          setSrc(meta.url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageId]);

  if (loading) {
    return (
      <div
        className={`skeleton ${className}`}
        style={{ width: width ?? '100%', height: height ?? 200 }}
        aria-label={`Loading image: ${alt}`}
        role="img"
      />
    );
  }

  if (error || !src) {
    const fallback = fallbackSrc ?? '/images/placeholder.svg';
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 text-gray-400 rounded-lg ${className}`}
        style={{ width: width ?? '100%', height: height ?? 200 }}
        role="img"
        aria-label={alt}
      >
        {fallbackSrc ? (
          <img
            src={fallbackSrc}
            alt={alt}
            width={width}
            height={height}
            className={`object-cover ${className}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <FiImage className="w-8 h-8" />
            <span className="text-xs">{alt}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`object-cover ${className}`}
      loading="lazy"
      decoding="async"
      onError={() => setError(true)}
    />
  );
}
