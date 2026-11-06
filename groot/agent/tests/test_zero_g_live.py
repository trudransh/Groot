import asyncio
import os

import pytest
from dotenv import load_dotenv

from voice_agent import zero_g

load_dotenv()


@pytest.mark.skipif(not os.environ.get("ZG_API_KEY"), reason="ZG_API_KEY not set")
def test_live_zero_g_call_returns_request_id():
    async def call():
        response = await zero_g.client().chat.completions.create(
            model=zero_g.config().model,
            messages=[{"role": "user", "content": "hii"}],
        )
        return zero_g.request_id(response), response.choices[0].message.content

    request_id, content = asyncio.run(call())
    print(f"0G request id: {request_id}")
    print(f"0G reply: {content}")
    assert request_id
