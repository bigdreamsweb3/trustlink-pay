from fastapi import Request


async def reply_handler(request: Request) -> dict:
    return {"result": (await request.json())["value"], "authorization": request.headers.get("authorization")}
