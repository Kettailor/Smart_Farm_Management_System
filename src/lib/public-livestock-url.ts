import { buildAppUrl, withBasePath } from "@/lib/app-path";

const QR_BYTE_LIMIT = 78;

function encodedAnimalId(animalId: string) {
  return encodeURIComponent(animalId);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

export function buildPublicLivestockAnimalPath(animalId: string) {
  return withBasePath(`/public/vat-nuoi/${encodedAnimalId(animalId)}`);
}

export function buildPublicLivestockAnimalShortPath(animalId: string) {
  return withBasePath(`/p/v/${encodedAnimalId(animalId)}`);
}

export function buildPublicLivestockAnimalQrValue(animalId: string, origin: string) {
  const shortPath = buildPublicLivestockAnimalShortPath(animalId);
  const absoluteShortUrl = buildAppUrl(origin, shortPath);
  return byteLength(absoluteShortUrl) <= QR_BYTE_LIMIT ? absoluteShortUrl : shortPath;
}
