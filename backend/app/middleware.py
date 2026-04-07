"""Request rate limiting middleware.

Uses an in-memory sliding window per IP. Sufficient for single-instance
deployment; swap to Redis-backed limiter when scaling horizontally.
"""
from collections import defaultdict
from time import time
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response, JSONResponse

# Rate limit tiers: (max_requests, window_seconds)
_TIERS = {
    "auth": (10, 60),       # 10 req/min — login/register
    "predict": (30, 60),    # 30 req/min — submitting predictions
    "read": (120, 60),      # 120 req/min — status polling, stats, board
    "admin": (20, 60),      # 20 req/min — admin operations
}

# Map route prefixes to tiers
_ROUTE_TIERS = {
    "/auth/": "auth",
    "/bounty/predict": "predict",
    "/bounty/skip": "predict",
    "/bounty/reset": "predict",
    "/bounty/irons/pick": "predict",
    "/bounty/titles/equip": "predict",
    "/admin/": "admin",
}


def _tier_for_path(path: str) -> str:
    """Determine rate limit tier for a request path."""
    for prefix, tier in _ROUTE_TIERS.items():
        if path.startswith(prefix):
            return tier
    return "read"


# Sliding window storage: {(ip, tier): [timestamp, ...]}
_windows: dict[tuple[str, str], list[float]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        tier = _tier_for_path(request.url.path)
        max_req, window_sec = _TIERS[tier]

        now = time()
        key = (ip, tier)

        # Prune expired entries
        _windows[key] = [t for t in _windows[key] if now - t < window_sec]

        if len(_windows[key]) >= max_req:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Max {max_req} requests per {window_sec}s for this endpoint."},
            )

        _windows[key].append(now)
        return await call_next(request)
