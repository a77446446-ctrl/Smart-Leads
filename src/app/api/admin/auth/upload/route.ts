import { adminGuard } from '@/lib/auth/admin-guard';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  try {
    const formData = await req.formData();
    const sessionFile = formData.get('session') as File | null;
    const jsonFile = formData.get('json') as File | null;

    const uploadDir = path.join(process.cwd(), 'uploads/auth');
    await mkdir(uploadDir, { recursive: true });

    if (sessionFile) {
      const buffer = Buffer.from(await sessionFile.arrayBuffer());
      await writeFile(path.join(uploadDir, 'maks.session'), buffer);
      console.log('MAKS Auth: .session file uploaded');
    }

    if (jsonFile) {
      const buffer = Buffer.from(await jsonFile.arrayBuffer());
      await writeFile(path.join(uploadDir, 'maks.json'), buffer);
      console.log('MAKS Auth: .json file uploaded');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('MAKS Auth: Upload failed:', error);
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
