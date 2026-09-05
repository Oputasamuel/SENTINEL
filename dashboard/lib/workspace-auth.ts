import { getSentinelUser } from '@/app/sentinel-auth';
import { cliUser } from '@/lib/cloud-api';

export async function workspaceUser(request: Request) {
  // A supplied bearer token must stand on its own; never fall back to cookies.
  if (request.headers.has('authorization')) {
    const userId = await cliUser(request);
    return userId ? { userId } : null;
  }
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== new URL(request.url).origin) return null;
  return getSentinelUser();
}
