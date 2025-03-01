import requests
import threading
import time
import logging
from collections import defaultdict, deque


class BazaarTracker:
    def __init__(self, update_interval=60, max_history=28800, plot_queue=None):
        self.data = {}
        self.history = defaultdict(lambda: deque(maxlen=max_history))
        self.lock = threading.Lock()
        self.update_interval = update_interval
        self.notifications = deque(maxlen=50)
        self.logger = self._setup_logger()
        self.plot_queue = plot_queue

    def _setup_logger(self):
        logger = logging.getLogger("BazaarTracker")
        handler = logging.StreamHandler()
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        return logger

    def update_data(self):
        from app.utils.data_bank import save_data  # FIX: Import here to break circular import

        url = "https://api.hypixel.net/v2/skyblock/bazaar"
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            bazaar_data = response.json()
            timestamp = time.time()

            with self.lock:
                self.data = bazaar_data.get("products", {})
                for item_id, details in self.data.items():
                    buy_price = self._get_price(details, "buy_summary")
                    sell_price = self._get_price(details, "sell_summary")

                    if buy_price is not None and sell_price is not None:
                        self.history[item_id].append({
                            "timestamp": timestamp,
                            "buy_price": buy_price,
                            "sell_price": sell_price,
                        })
                        save_data(item_id, buy_price, sell_price, timestamp)  # Save to PostgreSQL
                        self._notify_changes(item_id, buy_price, sell_price)

            self.logger.info(f"Data successfully updated with {len(self.data)} items.")
        except requests.RequestException as e:
            self.logger.error(f"Error updating bazaar data: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected error during update: {e}")

    def _get_price(self, details, key):
        try:
            return details[key][0]["pricePerUnit"] if details.get(key) else None
        except (KeyError, IndexError):
            return None


def run_updater(tracker):
    while True:
        tracker.update_data()
        time.sleep(60)


if __name__ == "__main__":
    tracker = BazaarTracker()
    updater_thread = threading.Thread(target=run_updater, args=(tracker,), daemon=True)
    updater_thread.start()
