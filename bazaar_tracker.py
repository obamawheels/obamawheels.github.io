import requests
import threading
import time
import logging
from collections import defaultdict, deque
from app.utils.data_bank import save_data  # Import PostgreSQL save function


class BazaarTracker:
    def __init__(self, update_interval=60, max_history=28800, plot_queue=None):
        """
        Initialize BazaarTracker with shared resources for data, history, and rate tracking.
        """
        self.data = {}
        self.history = defaultdict(lambda: deque(maxlen=max_history))  # Limit history per item
        self.lock = threading.Lock()
        self.update_interval = update_interval
        self.notifications = deque(maxlen=50)  # Queue for notifications
        self.logger = self._setup_logger()
        self.plot_queue = plot_queue

    def _setup_logger(self):
        """Set up a logger for tracking errors and updates."""
        logger = logging.getLogger("BazaarTracker")
        handler = logging.StreamHandler()
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        return logger

    def update_data(self):
        """
        Fetch data from the Hypixel Bazaar API and update the tracker.
        """
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
                        save_data(item_id, buy_price, sell_price)  # Save to PostgreSQL
                        self._notify_changes(item_id, buy_price, sell_price)

            self.logger.info(f"Data successfully updated with {len(self.data)} items.")
        except requests.RequestException as e:
            self.logger.error(f"Error updating bazaar data: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected error during update: {e}")

    def _get_price(self, details, key):
        """
        Safely extract the price per unit from a given key (buy_summary or sell_summary).
        """
        try:
            return details[key][0]["pricePerUnit"] if details.get(key) else None
        except (KeyError, IndexError):
            return None

    def _notify_changes(self, item_id, buy_price, sell_price):
        """
        Notify significant changes in buy or sell prices.
        """
        if buy_price is None or sell_price is None:
            self.logger.warning(f"Missing price data for {item_id}: buy_price={buy_price}, sell_price={sell_price}")

        if self.history[item_id]:
            last_entry = self.history[item_id][-1]
            if abs(last_entry["buy_price"] - buy_price) > 5:  # Example threshold
                self.notifications.append({
                    "item_id": item_id,
                    "change": "Buy price change",
                    "old_price": last_entry["buy_price"],
                    "new_price": buy_price,
                })
            if abs(last_entry["sell_price"] - sell_price) > 5:
                self.notifications.append({
                    "item_id": item_id,
                    "change": "Sell price change",
                    "old_price": last_entry["sell_price"],
                    "new_price": sell_price,
                })


def start_background_thread():
    """
    Start a background thread to update the tracker every minute.
    """
    tracker = BazaarTracker()
    thread = threading.Thread(target=tracker.update_data, daemon=True).start()
    thread.start() 


if __name__ == "__main__":
    start_background_thread()
