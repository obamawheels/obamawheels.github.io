import sqlite3
import time
import threading
from bazaar_tracker import BazaarTracker

# Initialize the database connection
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

# Save data to the database
def save_data(item_id, buy_price, sell_price):
    conn = sqlite3.connect('data_bank.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO data (item_id, buy_price, sell_price, timestamp)
        VALUES (?, ?, ?, ?)
    ''', (item_id, buy_price, sell_price, int(time.time())))
    conn.commit()
    conn.close()

# Fetch data from the database
def fetch_data(item_id):
    conn = sqlite3.connect('data_bank.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM data WHERE item_id = ?', (item_id,))
    data = cursor.fetchone()
    conn.close()
    return data

# Fetch all data from the database
def fetch_all_data():
    conn = sqlite3.connect('data_bank.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM data')
    data = cursor.fetchall()
    conn.close()
    return data

# Background thread to update data periodically
def start_background_thread():
    tracker = BazaarTracker()

    def background_data_updater():
        while True:
            try:
                tracker.update_data()
                for item_id, item_data in tracker.data.items():
                    save_data(item_id, item_data['buy_price'], item_data['sell_price'])
                print("Data successfully updated and saved to the database.")
            except Exception as e:
                print(f"Error updating data: {e}")
            time.sleep(60)  # Wait 60 seconds before the next update

    threading.Thread(target=background_data_updater, daemon=True).start()

# Initialize the database
init_db()

# Start the background thread
start_background_thread()