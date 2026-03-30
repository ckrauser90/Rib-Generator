import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';

    const { data: drafts, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('user_id', session.user.id)
      .order(sort, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching drafts:', error);
      return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 });
    }

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('Error in GET /api/drafts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, thumbnail_url, stl_data, metadata, credits_used } = body;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data: draft, error } = await supabase
      .from('drafts')
      .insert({
        user_id: session.user.id,
        name: name || 'Untitled Draft',
        thumbnail_url,
        stl_data,
        metadata: metadata || {},
        credits_used: credits_used || 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating draft:', error);
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 });
    }

    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/drafts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status:  500 });
  }
}
