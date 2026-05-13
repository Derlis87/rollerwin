import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get('file');
  if (!filename) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
  }

  const filePath = path.join('/home/z/my-project/download', filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  
  // Determine content type
  let contentType = 'application/octet-stream';
  if (filename.endsWith('.pdf')) contentType = 'application/pdf';
  if (filename.endsWith('.zip')) contentType = 'application/zip';
  if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) contentType = 'application/gzip';
  if (filename.endsWith('.txt')) contentType = 'text/plain';
  
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fileBuffer.length.toString(),
    },
  });
}
