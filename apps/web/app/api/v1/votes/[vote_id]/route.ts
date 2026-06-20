import { NextResponse } from 'next/server';
import { getVoteDetail } from '@/lib/votes';

export async function GET(request: Request, { params }: { params: { vote_id: string } }) {
  const vote_id = parseInt(params.vote_id);

  try {
    const data = await getVoteDetail(vote_id);
    if (!data) {
      return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Vote Detail API error:", error);
    return NextResponse.json({ error: "Failed to fetch vote detail" }, { status: 500 });
  }
}
