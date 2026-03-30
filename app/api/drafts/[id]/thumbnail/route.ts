import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Allowed: PNG, JPEG, WebP' 
      }, { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size: 5MB' 
      }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // First verify the draft belongs to the user
    const { data: draft, error: draftError } = await supabase
      .from('drafts')
      .select('id')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Generate unique filename: userId/draftId/timestamp.ext
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${session.user.id}/${id}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('Error uploading thumbnail:', uploadError);
      return NextResponse.json({ error: 'Failed to upload thumbnail' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(fileName);

    // Update draft with thumbnail URL
    const { data: updatedDraft, error: updateError } = await supabase
      .from('drafts')
      .update({ thumbnail_url: urlData.publicUrl })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating draft with thumbnail:', updateError);
      return NextResponse.json({ error: 'Failed to save thumbnail URL' }, { status: 500 });
    }

    return NextResponse.json({ 
      draft: updatedDraft,
      thumbnailUrl: urlData.publicUrl 
    });
  } catch (error) {
    console.error('Error in POST /api/drafts/[id]/thumbnail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
