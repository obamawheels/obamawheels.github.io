import os
from influxdb_client import InfluxDBClient, Point
import time
import threading
import logging
import sqlite3  # Keep for now

# InfluxDB Configuration (Read from environment variables)
INFLUXDB_URL = os.environ.get("INFLUXDB_URL")
INFLUXDB_ORG = os.environ.get("INFLUXDB_ORG")
INFLUXDB_BUCKET = os.environ.get("INFLUXDB_BUCKET")
INFLUXDB_TOKEN = os.environ.get("INFLUXDB_TOKEN")

if not all([INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET, INFLUXDB_URL]):
    raise ValueError("InfluxDB environment variables are not set!")
# SQLite Initialization (Keep for now)
def init_db():
    conn = sqlite3.connect('data_bank.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS data (
            item_id TEXT PRIMARY KEY,
            buy_price REAL,
            sell_price REAL,
            timestamp INTEGER
        )
    ''')
    conn.commit()
    conn.close()

# SQLite Save Data (Keep for now)
def save_data(item_id, buy_price, sell_price):
    conn = sqlite3.connect('data_bank.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO data (item_id, buy_price, sell_price, timestamp)
        VALUES (?, ?, ?, ?)
    ''', (item_id, buy_price, sell_price, int(time.time())))
    conn.commit()
    conn.close()

# Fetch data from the SQLite database (Keep for now)
def fetch_data(item_id):
    conn = sqlite3.connect('data_bank.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM data WHERE item_id = ?', (item_id,))
    data = cursor.fetchone()
    conn.close()
    return data

# Fetch all data from the SQLite database (Keep for now)
def fetch_all_data():
    conn = sqlite3.connect('data_bank.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM data')
    data = cursor.fetchall()
    conn.close()
    return data

# Function to write data to InfluxDB
def write_to_influxdb(item_id, buy_price, sell_price, timestamp):
    logging.info(f"Attempting to write to InfluxDB: item_id={item_id}, buy_price={buy_price}, sell_price={sell_price}, timestamp={timestamp}")

    try:
        client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
        write_api = client.write_api()

        point = Point("item_prices") \
            .tag("item_id", item_id) \
            .field("buy_price", buy_price) \
            .field("sell_price", sell_price) \
            .time(timestamp, write_precision='s')

        write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)

        write_api.close()
        client.close()

        logging.info(f"Successfully wrote data to InfluxDB: item_id={item_id}, buy_price={buy_price}, sell_price={sell_price}, timestamp={timestamp}")
    except Exception as e:
        logging.error(f"Error writing data to InfluxDB: {e}")

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
                    logging.info(f"Item data for item_id {item_id}: {item_data}")  # This line confirms data is being read.

                    buy_price = item_data.get('buy_price', 0)  # Default to 0 if 'buy_price' is missing
                    sell_price = item_data.get('sell_price', 0)  # Default to 0 if 'sell_price' is missing
                    logging.info(f"After extraction - Buy price: {buy_price}, Sell price: {sell_price}") #This line shows what prices are before they are saved!

                    timestamp = int(time.time())
                    save_data(item_id, buy_price, sell_price)
                    write_to_influxdb(item_id, buy_price, sell_price, timestamp)
                    logging.info(f"Data successfully updated and saved to the database and InfluxDB: Item ID = {item_id}")
            except Exception as e:
                logging.error(f"Error updating data: {e}")
                    
            time.sleep(60)  # Wait 60 seconds before the next update

    threading.Thread(target=background_data_updater, daemon=True).start()

# Initialize the SQLite database
init_db()

# Start the background thread
start_background_thread()