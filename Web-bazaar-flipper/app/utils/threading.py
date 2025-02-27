import time
import threading
from concurrent.futures import ThreadPoolExecutor
from app.utils.cache import get_tracker

def update_data_with_threading():
    """
    Update tracker data using a thread pool executor for better concurrency.
    """
    tracker = get_tracker()
    with ThreadPoolExecutor(max_workers=5) as executor:
        executor.submit(tracker.update_data)

def start_background_thread():
    """
    Start a background thread to periodically update tracker data.
    """
    tracker = get_tracker()

    def background_data_updater():
        while True:
            try:
                tracker.update_data()
            except Exception as e:
                print(f"Error updating data: {e}")
            time.sleep(60)  # Wait 60 seconds before the next update

    # Start the thread as a daemon
    threading.Thread(target=background_data_updater, daemon=True).start()