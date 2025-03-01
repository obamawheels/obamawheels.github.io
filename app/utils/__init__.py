from .cache import configure_cache, get_tracker
from .data_bank import init_db
from .tracker_helpers import (
    fetch_item_data,
    fetch_item_history,
    fetch_top_items,
    calculate_profitability,
    fetch_notifications,
    fetch_dashboard_stats,
)

init_db()

# Public API for the `utils` module
__all__ = [
    "configure_cache",
    "get_tracker",
    "start_background_thread",
    "fetch_item_data",
    "fetch_item_history",
    "fetch_top_items",
    "calculate_profitability",
    "fetch_notifications",
    "fetch_dashboard_stats",
]
