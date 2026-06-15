import asyncio
from sqlalchemy import select
from app.database import engine
from app.db_models.vote import VoteHeader

async def run():
    async with engine.connect() as conn:
        res = await conn.execute(
            select(VoteHeader.vote_id, VoteHeader.vote_item_dscr, VoteHeader.sess_item_dscr)
            .order_by(VoteHeader.vote_date.desc(), VoteHeader.vote_id.desc())
            .limit(30)
        )
        for row in res.fetchall():
            print(f"ID: {row[0]} | Item: {row[1]} | Session: {row[2]}")

if __name__ == "__main__":
    asyncio.run(run())
