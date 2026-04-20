from fastapi import FastAPI

app = FastAPI(title="ImageLingo API")


@app.get("/health")
async def health():
    return {"status": "ok"}
