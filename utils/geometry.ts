
import { Rect, Point } from '../types';

/**
 * Maps a click on the video element (which might have letterboxing due to object-fit: contain)
 * to the actual coordinates of the video source resolution.
 */
export const mapScreenToVideo = (
  screenX: number,
  screenY: number,
  videoElement: HTMLVideoElement
): Point => {
  const rect = videoElement.getBoundingClientRect();
  const videoRatio = videoElement.videoWidth / videoElement.videoHeight;
  const elementRatio = rect.width / rect.height;

  let displayWidth = rect.width;
  let displayHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  // Calculate the actual displayed dimensions of the video content
  if (elementRatio > videoRatio) {
    // Letterboxing on sides
    displayWidth = rect.height * videoRatio;
    offsetX = (rect.width - displayWidth) / 2;
  } else {
    // Letterboxing on top/bottom
    displayHeight = rect.width / videoRatio;
    offsetY = (rect.height - displayHeight) / 2;
  }

  // Calculate relative position within the displayed video
  const relativeX = screenX - rect.left - offsetX;
  const relativeY = screenY - rect.top - offsetY;

  // Scale to video source dimensions
  const scaleX = videoElement.videoWidth / displayWidth;
  const scaleY = videoElement.videoHeight / displayHeight;

  return {
    x: Math.max(0, Math.min(videoElement.videoWidth, relativeX * scaleX)),
    y: Math.max(0, Math.min(videoElement.videoHeight, relativeY * scaleY)),
  };
};

/**
 * Checks if a point is inside a rectangle
 */
export const isPointInRect = (point: Point, rect: Rect): boolean => {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
};
