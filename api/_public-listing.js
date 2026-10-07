// Public catalog projection. Firestore listings also carry operator metadata;
// an anonymous response must never serialize arbitrary document fields.
const PUBLIC_SCALARS = [
  'name', 'title', 'zone', 'neighborhood', 'address', 'type',
  'price', 'deposit', 'depositMonths', 'agencyFee', 'concordato',
  'sqm', 'size', 'beds', 'bedrooms', 'baths', 'bathrooms', 'floor', 'furnished',
  'status', 'availabilityStatus', 'availableFrom', 'availableDate',
  'description', 'lat', 'lng', 'image', 'coverImage',
  'videoUrl', 'youtubeUrl', 'photosEnhancedAt', 'createdAt', 'updatedAt',
];
const PUBLIC_STRING_ARRAYS = ['images', 'features', 'tags', 'amenities'];
const PRIVATE_STATES = new Set([
  'draft', 'hidden', 'archived', 'off_market', 'off-market',
  'private', 'internal', 'unpublished',
]);

export function isPublicListing(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.published === false || raw.isPublished === false || raw.public === false
      || raw.isPrivate === true || raw.hidden === true || raw.offMarket === true)
    return false;
  for (const key of ['status', 'availabilityStatus', 'visibility',
    'publicationStatus', 'publishStatus']) {
    if (PRIVATE_STATES.has(String(raw[key] || '').trim().toLowerCase())) return false;
  }
  return true;
}

export function projectPublicListing(id, raw) {
  if (!isPublicListing(raw)) return null;
  const out = { id: String(id) };
  for (const key of PUBLIC_SCALARS) {
    const v = raw[key];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      out[key] = v;
  }
  for (const key of PUBLIC_STRING_ARRAYS) {
    if (Array.isArray(raw[key])) out[key] = raw[key].filter(v => typeof v === 'string');
  }
  if (raw.geo && typeof raw.geo === 'object') {
    const geo = {};
    for (const key of ['lat', 'lng', 'src', 'q']) {
      const v = raw.geo[key];
      if (typeof v === 'string' || typeof v === 'number') geo[key] = v;
    }
    if (Object.keys(geo).length) out.geo = geo;
  }
  if (Array.isArray(raw.imagesVariants)) {
    out.imagesVariants = raw.imagesVariants.map(v => {
      if (!v || typeof v !== 'object') return {};
      const image = {};
      for (const key of ['src', 'w480', 'w960']) {
        if (typeof v[key] === 'string') image[key] = v[key];
      }
      return image;
    });
  }
  return out;
}
