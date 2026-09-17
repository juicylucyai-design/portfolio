import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PUBLIC_PATHS = new Set(['/favicon.ico', '/icon.svg', '/robots.txt']);
const LOGIN_PATHS = new Set(['/login', '/login/', '/login.html']);
const PAGE_NAME = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/i;

/**
 * Serves the exported pages at clean URLs: /login → login.html, /investments/new → investments/new.html.
 * (The export also has same-named folders of page data, which a plain static server would redirect into.)
 */
export function htmlPages(webBuildDir: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/_next/') || path.extname(req.path)) return next();

    const name = req.path === '/' ? 'index' : req.path.replace(/^\/+|\/+$/g, '');
    if (!PAGE_NAME.test(name)) return next();
    const file = path.join(webBuildDir, `${name}.html`);
    if (!existsSync(file)) return next();
    return res.sendFile(file);
  };
}

/**
 * Protects every web page, not just the API: without a valid session, any page redirects to /login.
 * API routes are left to the auth guard, which answers 401 instead of redirecting.
 */
export function pageGate(isSignedIn: (req: Request) => Promise<boolean>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const path = req.path;
      if (path === '/api' || path.startsWith('/api/') || path.startsWith('/_next/') || PUBLIC_PATHS.has(path)) return next();

      const signedIn = await isSignedIn(req);
      if (LOGIN_PATHS.has(path)) return signedIn ? res.redirect('/') : next();
      if (!signedIn) return res.redirect('/login');

      res.setHeader('Cache-Control', 'no-store');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
}
