export function isBillingAdministrator(user: { role?: string; email?: string } | null | undefined, allowlist: string | undefined): boolean {
  return user?.role === 'ADMIN' && Boolean(user.email) && Boolean(allowlist?.split(',').map(email => email.trim().toLowerCase()).filter(Boolean).includes(user.email.trim().toLowerCase()));
}

export function isPlatformManagementRequest(
  user: { role?: string; email?: string }, headers: Record<string, unknown>, rawPath: string,
  config: { get<T = string>(key: string): T | undefined },
): boolean {
  const path = rawPath.split('?')[0].replace(/\/+$/, '');
  const secret = config.get<string>('GYMDASH_SECRET');
  return Boolean(secret) && headers['x-gymdash-secret'] === secret
    && isBillingAdministrator(user, config.get<string>('GYMDASH_BILLING_ADMIN_EMAILS'))
    && /^\/(?:api\/v1\/)?(?:platform-billing(?:\/|$)|app-releases\/admin(?:\/|$)|dashboard\/global(?:\/|$)|gym(?:\/|$)|monitoring(?:\/|$)|users\/admin-create$|users\/admin\/[^/]+\/(?:contact|reset-password)$)/.test(path);
}

export function isAccountSecurityRequest(rawPath: string): boolean {
  return /^\/(?:api\/v1\/)?auth\/(?:me|logout|password(?:\/force)?)$/.test(rawPath.split('?')[0].replace(/\/+$/, ''));
}
