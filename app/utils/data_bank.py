import os
import threading
import time
import logging
from influxdb_client import InfluxDBClient, Point
from datetime import datetime

# InfluxDB Configuration (Read from environment variables)
INFLUXDB_URL = os.environ.get("INFLUXDB_URL")
INFLUXDB_ORG = os.environ.get("INFLUXDB_ORG")
INFLUXDB_BUCKET = os.environ.get("INFLUXDB_BUCKET")
INFLUXDB_TOKEN = os.environ.get("INFLUXDB_TOKEN")

if not all([INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET, INFLUXDB_URL]):
    raise ValueError("InfluxDB environment variables are not set!")

logging.info("InfluxDB settings loaded successfully.")

# Initialize InfluxDB client outside the function to save resources
client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
write_api = client.write_api()  # Create a single write_api instance

def write_to_influxdb(item_id, buy_price, sell_price, timestamp):
    """Writes item data to InfluxDB, with explicit float conversion and validation tag."""

    try:
        point = Point("item_prices") \
            .tag("item_id", item_id) \
            .field("buy_price", float(buy_price))  \
            .field("sell_price", float(sell_price)) \
            .tag("valid_prices", True if buy_price > 0 and sell_price > 0 else False) \
            .time(timestamp, write_precision='s')

        write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)

    except Exception as e:
        logging.error(f"Error writing data to InfluxDB: {e}")

def close_influxdb_client():
    logging.info("Closing InfluxDB client and write API")
    write_api.close()
    client.close()
    logging.info("InfluxDB client and write API closed successfully")

# Modified background thread to update data periodically
def start_background_thread():
    # Assuming you have access to BazaarTracker instance here
    from bazaar_tracker import BazaarTracker  # Import here to avoid circular dependency
    tracker = BazaarTracker() # you will need to initialize your tracker with proper api keys, etc.

    def background_data_updater():
        while True:
            try:
                tracker.update_data()
                for item_id, item_data in tracker.data.items():

                    # Debug and check where the prices are located

                    #Get prices properly
                    buy_price = item_data.get('quick_status',{}).get('buyPrice', 0)  # Default to 0 if 'buyPrice' is missing
                    sell_price = item_data.get('quick_status', {}).get('sellPrice', 0)  # Default to 0 if 'sellPrice' is missing

                    #Logging to help debug!

                    timestamp = int(time.time())
                    write_to_influxdb(item_id, buy_price, sell_price, timestamp)

                logging.info(f"Data successfully updated and saved to the database and InfluxDB")
            except Exception as e:
                logging.error(f"Error updating data: {e}")
            #It's important that time is at the end.
            time.sleep(60)  # Wait 60 seconds before the next update

    threading.Thread(target=background_data_updater, daemon=True).start()

# Start the background thread
start_background_thread()