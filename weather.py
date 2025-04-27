from typing import Any
import httpx
from mcp.server.fastmcp import FastMCP

# 👋 Initialize the MCP server with a friendly name
mcp = FastMCP("weather")

# 🌐 Constants for the National Weather Service (NWS)
NWS_API_BASE = "https://api.weather.gov"
USER_AGENT = "weather-app/1.0"

# =======================
# 📡 Helper: Fetch data from NWS
# =======================
async def make_nws_request(url: str) -> dict[str, Any] | None:
    """Make a request to the NWS API with proper headers and error handling."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/geo+json"
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
        except Exception:
            return None

# =======================
# 🧾 Helper: Format alerts into readable text
# =======================
def format_alert(feature: dict) -> str:
    """Turn one alert feature into human-readable text."""
    props = feature["properties"]
    return f"""
Event: {props.get('event', 'Unknown')}
Area: {props.get('areaDesc', 'Unknown')}
Severity: {props.get('severity', 'Unknown')}
Description: {props.get('description', 'No description available')}
Instructions: {props.get('instruction', 'No specific instructions provided')}
"""

# =======================
# 🛠 Tool: Get weather alerts by state
# =======================
@mcp.tool()
async def get_alerts(state: str) -> str:
    """
    Fetch active weather alerts for a given US state (e.g. "CA", "NY").
    """
    url = f"{NWS_API_BASE}/alerts/active/area/{state.upper()}"
    data = await make_nws_request(url)

    if not data or "features" not in data:
        return "Unable to fetch alerts or no alerts found."
    if not data["features"]:
        return "No active alerts for this state."

    alerts = [format_alert(feature) for feature in data["features"]]
    return "\n---\n".join(alerts)

# =======================
# 🛠 Tool: Get forecast by lat/lon
# =======================
@mcp.tool()
async def get_forecast(latitude: float, longitude: float) -> str:
    """
    Fetch a short-term forecast using a lat/lon pair.
    """
    # Step 1: Get forecast grid endpoint
    points_url = f"{NWS_API_BASE}/points/{latitude},{longitude}"
    points_data = await make_nws_request(points_url)
    if not points_data:
        return "Unable to fetch forecast data for this location."

    # Step 2: Use the forecast URL from that response
    forecast_url = points_data["properties"]["forecast"]
    forecast_data = await make_nws_request(forecast_url)
    if not forecast_data:
        return "Unable to fetch detailed forecast."

    # Step 3: Format the next 5 forecast periods
    periods = forecast_data["properties"]["periods"]
    forecasts = []
    for period in periods[:5]:
        forecasts.append(f"""
{period['name']}:
Temperature: {period['temperature']}°{period['temperatureUnit']}
Wind: {period['windSpeed']} {period['windDirection']}
Forecast: {period['detailedForecast']}
""")

    return "\n---\n".join(forecasts)

# =======================
# 🚀 Run the MCP server
# =======================
if __name__ == "__main__":
    # This runs the server using stdio transport — for Claude or your custom client
    mcp.run(transport="stdio")
