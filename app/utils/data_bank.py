import psycopg2
import os
import time
import threading

# Get Heroku PostgreSQL URL
DATABASE_URL = os.environ.get("DATABASE_URL")

# Initialize the database connection
def init_db():
    """Create the database table if it doesn't exist."""
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS data (
            item_id TEXT PRIMARY KEY,
            buy_price REAL,
            sell_price REAL,
            timestamp BIGINT
        )
    ''')
    conn.commit()
    cursor.close()
    conn.close()

# Save data to PostgreSQL
def save_data(item_id, buy_price, sell_price):
    """Insert or update data in the database."""
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO data (item_id, buy_price, sell_price, timestamp)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (item_id) DO UPDATE
        SET buy_price = EXCLUDED.buy_price,
            sell_price = EXCLUDED.sell_price,
            timestamp = EXCLUDED.timestamp
    ''', (item_id, buy_price, sell_price, int(time.time())))
    conn.commit()
    cursor.close()
    conn.close()

# Fetch data for a specific item
def fetch_data(item_id):
    """Retrieve data from the database."""
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM data WHERE item_id = %s', (item_id,))
    data = cursor.fetchone()
    cursor.close()
    conn.close()
    return data

# Fetch all data
def fetch_all_data():
    """Retrieve all data from the database."""
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM data')
    data = cursor.fetchall()
    cursor.close()
    conn.close()
    return data

# Background thread to update data periodically
def start_background_thread():
    from bazaar_tracker import BazaarTracker  # Import inside function to avoid circular import

    tracker = BazaarTracker()

    def background_data_updater():
        while True:
            try:
                tracker.update_data()
                for item_id, item_data in tracker.data.items():
                    save_data(item_id, item_data.get("buy_price", 0), item_data.get("sell_price", 0))
                print("Data successfully updated and saved to the database.")
            except Exception as e:
                print(f"Error updating data: {e}")
            time.sleep(60)  # Wait 60 seconds before the next update

    threading.Thread(target=background_data_updater, daemon=True).start()

# Initialize the PostgreSQL database
init_db()

# Start the background update thread
start_background_thread()
