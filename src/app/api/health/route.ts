import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const start = performance.now();
    
    // Check DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const duration = performance.now() - start;

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      latency: Math.round(duration) + 'ms',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }, { status: 200 });
  } catch (error) {
    console.error('Healthcheck failed:', error);
    return NextResponse.json({
      status: 'error',
      db: 'disconnected',
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
