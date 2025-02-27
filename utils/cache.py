from cachetools import TTLCache
from bazaar_tracker import BazaarTracker

# Cache and tracker instances
cache = None
tracker = None

def configure_cache():
    """
    Configure the cache and tracker instance.
    This should be called once during app initialization.
    """
    global cache, tracker
    cache = TTLCache(maxsize=100, ttl=300)  # Cache with 100 entries, 5-minute expiration
    tracker = BazaarTracker()

def get_tracker():
    """
    Retrieve the tracker instance.
    Returns:
        BazaarTracker: The global tracker instance.
    """
    global tracker
    if tracker is None:
        raise RuntimeError("Tracker not initialized. Call configure_cache() first.")
    return tracker
