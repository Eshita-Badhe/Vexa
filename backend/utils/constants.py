SCENARIO_NAMES = [
    "healthy",
    "network_congestion",
    "cdn_degradation",
    "server_overload",
    "application_failure",
]

MULTI_FACTOR_SCENARIOS = [
    "network_congestion",
    "cdn_degradation",
    "server_overload",
    "application_failure",
]

ANOMALY_THRESHOLDS = {
    "bitrate_drop_percent": 30,
    "buffering_increase_percent": 100,
    "latency_increase_percent": 100,
    "packet_loss_increase_percent": 100,
    "jitter_increase_percent": 100,
    "playback_failure_increase_percent": 100,
    "crash_increase_percent": 100,
    "qoe_degradation_percent": 20,
    "z_score": 3,
}

MIN_CONSECUTIVE_POINTS = 2
ROLLING_WINDOW_SIZE = 5
SEVERITY_THRESHOLDS = {
    "WARNING": 50,
    "CRITICAL": 80,
}

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
