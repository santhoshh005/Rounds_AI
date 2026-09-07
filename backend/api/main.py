from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.agents.round_graph import round_graph
from backend.models.round import ExtractRoundRequest, ExtractRoundResponse

app = FastAPI(title="RoundsAI API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "demo-only"}

@app.post("/api/v1/rounds/extract", response_model=ExtractRoundResponse)
def extract_round(request: ExtractRoundRequest) -> ExtractRoundResponse:
    state = round_graph.invoke({"transcript": request.transcript})
    return ExtractRoundResponse(extraction=state["extraction"], review_flags=state["review_flags"], draft_note=state["draft_note"], disclaimer="Demo / research prototype. Not for autonomous clinical decision-making or real patient data.")
