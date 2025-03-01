import psycopg2
import os
import requests
import threading
import time
from collections import defaultdict, deque
import logging

class BazaarTracker:
    def __init__(self, update_interval=60, max_history=525600, plot_queue=None):
        """
        Initialize BazaarTracker with shared resources for data, history, and rate tracking,
        and database connection.
        """
        self.data = {}
        self.history = defaultdict(lambda: deque(maxlen=max_history))
        self.lock = threading.Lock()
        self.update_interval = update_interval
        self.notifications = deque(maxlen=50)
        self.logger = self._setup_logger()
        self.plot_queue = plot_queue

        # Database connection
        self.database_url = os.environ.get("DATABASE_URL")  # Fetch from env
        self.conn = None  # Initialize connection
        self.cursor = None

        self._connect_to_db()

    def _connect_to_db(self):
      """Connect to postgres."""
      try:
        self.conn = psycopg2.connect(self.database_url, sslmode="require")
        self.cursor = self.conn.cursor()
        self.logger.info("Successfully connected to database")
      except Exception as e:
        self.logger.error(f"Error connecting to database: {e}")


    def _setup_logger(self):
        # (Logger setup - No changes needed)
        logger = logging.getLogger("BazaarTracker")
        handler = logging.StreamHandler()
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        return logger

    def update_data(self):
        """
        Fetch data and save it to the database.
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
                        # Notify if significant price change occurs
                        self._notify_changes(item_id, buy_price, sell_price)

                        # Save data to database directly from here
                        self._save_data_to_db(item_id, buy_price, sell_price, timestamp)

            self.logger.info(f"Data successfully updated and saved with {len(self.data)} items.")
        except requests.RequestException as e:
            self.logger.error(f"Error updating bazaar data: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected error during update: {e}")

    def _save_data_to_db(self, item_id, buy_price, sell_price, timestamp):
        """Saves item data to the database."""
        try:
            self.cursor.execute('''
                INSERT INTO data (item_id, buy_price, sell_price, timestamp)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (item_id) DO UPDATE
                SET buy_price = EXCLUDED.buy_price,
                    sell_price = EXCLUDED.sell_price,
                    timestamp = EXCLUDED.timestamp
            ''', (item_id, buy_price, sell_price, int(timestamp)))
            self.conn.commit()
        except Exception as e:
            self.logger.error(f"Error saving data to database: {e}")
            self.conn.rollback()

    def _get_price(self, details, key):
        # (No changes needed)
        try:
            return details[key][0]["pricePerUnit"] if details.get(key) else None
        except (KeyError, IndexError):
            return None

    def _get_total_quantity(self, details, key):
        """
        Calculate the total quantity from a given key (buy_summary or sell_summary).
        """
        try:
            return sum(order.get("amount", 0) for order in details.get(key, []))
        except Exception:
            return 0

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

    def calculate_rates(self):
        # (No changes needed)
        """
        Calculate buy and sell order rates (orders per minute) from historical data.
        """
        current_time = time.time()
        buy_rates = []
        sell_rates = []

        with self.lock:
            for price_history in self.history.values():
                recent = [entry for entry in price_history if current_time - entry["timestamp"] <= 60]
                buy_rates.append(len(recent))
                sell_rates.append(len(recent))

        buy_rate = sum(buy_rates) / len(buy_rates) if buy_rates else 0
        sell_rate = sum(sell_rates) / len(sell_rates) if sell_rates else 0
        return buy_rate, sell_rate

    def calculate_difficulty(self):
        # (No changes needed)
        """
        Calculate difficulty based on buy and sell rates.
        """
        buy_rate, sell_rate = self.calculate_rates()
        return (buy_rate + sell_rate) / 2 if (buy_rate + sell_rate) > 0 else 1

    def get_autocomplete_suggestions(self, query):
        # (No changes needed)
        """
        Return a list of item IDs matching the query.
        """
        with self.lock:
            return [item_id for item_id in self.data.keys() if query in item_id.lower()][:10]

    def get_item_data(self, item_name):
        # (No changes needed, but update with new connection logic if needed)
        """
        Retrieve detailed data for a specific item.
        """
        with self.lock:
            for item_id, details in self.data.items():
                if item_name.lower() in item_id.lower():
                    buy_price = self._get_price(details, "buy_summary") or 0.0
                    sell_price = self._get_price(details, "sell_summary") or 0.0

                    demand = self._get_total_quantity(details, "buy_summary")
                    supply = self._get_total_quantity(details, "sell_summary")
                    margin = round(buy_price - sell_price, 2)

                    return {
                        "item_id": item_id,
                        "buy_price": buy_price,
                        "sell_price": sell_price,
                        "margin": margin,
                        "demand": demand,
                        "supply": supply,
                    }
        return None

    def get_item_history(self, item_name):
        # (No changes needed, but update with new connection logic if needed)
        """
        Return historical price data for graphing.
        """
        with self.lock:
            for item_id, price_history in self.history.items():
                if item_name.lower() in item_id.lower():
                    return list(price_history)
        return None

    def get_top_margins(self, sort_by="margin", order="desc"):
        # (No changes needed, but update with new connection logic if needed)
        """
        Return the top 10 items with the highest margins.
        """
        with self.lock:
            items = []
            for item_id, details in self.data.items():
                buy_price = self._get_price(details, "buy_summary")
                sell_price = self._get_price(details, "sell_summary")

                if buy_price is not None and sell_price is not None:
                    margin = round(buy_price - sell_price, 2)
                    items.append({
                        "item_id": item_id,
                        "buy_price": buy_price,
                        "sell_price": sell_price,
                        "margin": margin,
                    })

            reverse = order == "desc"
            items.sort(key=lambda x: x.get(sort_by, 0), reverse=reverse)
            return items[:10]

    def get_profitability(self, coins):
        # (No changes needed, but update with new connection logic if needed)
        """
        Calculate profitability adjusted for difficulty.
        """
        with self.lock:
            results = []
            difficulty = self.calculate_difficulty()
            for item_id, details in self.data.items():
                buy_price = self._get_price(details, "buy_summary")
                sell_price = self._get_price(details, "sell_summary")

                if buy_price and sell_price:
                    margin = buy_price - sell_price
                    profit_per_minute = (margin / difficulty) * coins
                    profit_per_hour = profit_per_minute * 60

                    results.append({
                        "item_id": item_id,
                        "profit_per_minute": profit_per_minute,
                        "profit_per_hour": profit_per_hour,
                    })
            return sorted(results, key=lambda x: x["profit_per_hour"], reverse=True)

    def close_connection(self):
        """Closes the database connection."""
        if self.conn:
            self.conn.close()
            self.logger.info("Database connection closed.")

# Standalone methods (re-added)
def run_updater(tracker):
    """
    Continuously update bazaar data every minute.
    """
    while True:
        tracker.update_data()
        time.sleep(60)
# Removed redundant __init__ method
        pass


if __name__ == "__main__":
    tracker = BazaarTracker()
    updater_thread = threading.Thread(target=run_updater, args=(tracker,), daemon=True)
    updater_thread.start()