import os
from dotenv import load_dotenv

from imagine.client import ImagineClient
from imagine.types.chat_completions import ChatMessage

load_dotenv()

api_key = os.getenv("IMAGINE_API_KEY")
endpoint = os.getenv("IMAGINE_API_ENDPOINT")
model = os.getenv("IMAGINE_MODEL")

print("Endpoint:", endpoint)
print("Model:", model)
print("API key loaded:", bool(api_key))

if not api_key:
    raise RuntimeError("IMAGINE_API_KEY is missing")

if not endpoint:
    raise RuntimeError("IMAGINE_API_ENDPOINT is missing")

if not model:
    raise RuntimeError("IMAGINE_MODEL is missing")


client = ImagineClient(
    endpoint,
    api_key,
    max_retries=3,
    timeout=60,
    verify=False,
)

response = client.chat(
    messages=[
        ChatMessage(
            role="user",
            content="Explain what network congestion means in video streaming in one sentence."
        )
    ],
    model=model,
)

print("\n===== QUALCOMM RESPONSE =====")
print(response.first_content)