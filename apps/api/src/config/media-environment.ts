import { z } from 'zod';
import { ConfigurationError } from './environment.js';

const cloudSchema = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  CLOUDINARY_API_KEY: z.string().regex(/^\d{5,32}$/),
  CLOUDINARY_API_SECRET: z.string().min(16).max(512).regex(/^\S+$/),
  CLOUDINARY_FOLDER: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .default('docampo-demo'),
  MEDIA_PUBLIC_BASE: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname.replace(/\/$/, '') === '/api/media'
      );
    } catch {
      return false;
    }
  }),
});
export function parseCloudinaryEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const result = cloudSchema.safeParse({
    ...environment,
    MEDIA_PUBLIC_BASE:
      environment.MEDIA_PUBLIC_BASE ||
      (environment.RENDER_EXTERNAL_URL
        ? environment.RENDER_EXTERNAL_URL.replace(/\/$/, '') + '/api/media'
        : undefined),
  });
  if (!result.success)
    throw new ConfigurationError(result.error.issues.map((v) => v.path.join('.')));
  const value = result.data;
  return {
    cloudName: value.CLOUDINARY_CLOUD_NAME,
    apiKey: value.CLOUDINARY_API_KEY,
    apiSecret: value.CLOUDINARY_API_SECRET,
    folder: value.CLOUDINARY_FOLDER,
    publicBase: value.MEDIA_PUBLIC_BASE.replace(/\/$/, ''),
  };
}
export type CloudinaryConfiguration = ReturnType<typeof parseCloudinaryEnvironment>;
