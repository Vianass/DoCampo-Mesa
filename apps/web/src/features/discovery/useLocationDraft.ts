import { useState } from 'react';
import type { PublicLocation } from './location';
export function useLocationDraft(initial?: PublicLocation) {
  const [enabled, setEnabled] = useState(!!initial),
    [latitude, setLatitude] = useState(initial ? String(initial.latitude) : ''),
    [longitude, setLongitude] = useState(initial ? String(initial.longitude) : ''),
    [description, setDescription] = useState(initial?.descricao ?? ''),
    [consent, setConsent] = useState(!!initial);
  const valid =
    consent &&
    latitude !== '' &&
    longitude !== '' &&
    Number.isFinite(Number(latitude)) &&
    Math.abs(Number(latitude)) <= 90 &&
    Number.isFinite(Number(longitude)) &&
    Math.abs(Number(longitude)) <= 180 &&
    !!description.trim();
  const value = enabled
    ? {
        latitude: Number(latitude),
        longitude: Number(longitude),
        descricao: description.trim(),
        autorizada: consent,
      }
    : null;
  const dirty =
    JSON.stringify(value) !== JSON.stringify(initial ? { ...initial, autorizada: true } : null);
  return {
    enabled,
    setEnabled,
    latitude,
    longitude,
    description,
    consent,
    setConsent,
    valid,
    value,
    dirty,
    setLatitude: (v: string) => {
      setLatitude(v);
      setConsent(false);
    },
    setLongitude: (v: string) => {
      setLongitude(v);
      setConsent(false);
    },
    setDescription: (v: string) => {
      setDescription(v);
      setConsent(false);
    },
  };
}
