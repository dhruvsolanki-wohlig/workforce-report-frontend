import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/') || pathname === '/health') {
    // Use BACKEND_URL from environment, with sensible defaults for different setups:
    // - Docker Compose internal: http://backend:8000
    // - Separate deploy: https://api.yourdomain.com
    // - Local dev: http://127.0.0.1:8000
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    
    const targetUrl = new URL(pathname + request.nextUrl.search, backendUrl);
    return NextResponse.rewrite(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/health'],
};
