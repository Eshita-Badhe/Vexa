SCENARIO_NAMES = [
    "healthy",
    "network_congestion",
    "cdn_degradation",
    "server_overload",
    "application_failure",
]

REGIONS = ["Pune", "Mumbai", "Delhi", "Bangalore", "Hyderabad"]
DEVICES = ["Android", "iOS", "Web", "SmartTV"]
CDNS = ["CDN-A", "CDN-B", "CDN-C"]
RESOLUTIONS = ["480p", "720p", "1080p", "4K"]

REQUIRED_TELEMETRY_COLUMNS = [
    "timestamp",
    "session_id",
    "region",
    "device",
    "cdn",
    "bitrate",
    "buffering_time",
    "latency",
    "packet_loss",
    "jitter",
    "playback_failures",
    "crashes",
    "startup_time",
    "resolution",
]
