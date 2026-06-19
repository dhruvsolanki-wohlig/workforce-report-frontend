import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/') || pathname === '/health') {
    // Dynamically retrieve the backend URL at runtime (in Docker or Cloud Run)
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    
    // Construct the destination URL preserving the full path and search parameters
    const targetUrl = new URL(pathname + request.nextUrl.search, backendUrl);
    
    // Rewrite the request to proxy it to the backend
    return NextResponse.rewrite(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on /api/* and /health
  matcher: ['/api/:path*', '/health'],
};
