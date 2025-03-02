import psycopg2
import os
import time
import threading
from bazaar_tracker import BazaarTracker

# Get Heroku PostgreSQL URL
DATABASE_URL = os.environ.get("DATABASE_URL")

# Initialize the database connection
def init_db():
    """Create the database table if it doesn't exist."""
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS data (
                item_id TEXT,
                buy_price REAL,
                sell_price REAL,
                timestamp BIGINT,
                PRIMARY KEY (item_id, timestamp)
            )
        ''')
        conn.commit()
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# Save data to PostgreSQL
def save_data(item_id, buy_price, sell_price, timestamp):
    """Insert data into the database."""
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cursor = conn.cursor()

        # Check if the record already exists
        cursor.execute('''
            SELECT buy_price, sell_price
            FROM data
            WHERE item_id = %s AND timestamp = %s
        ''', (item_id, timestamp))
        existing_record = cursor.fetchone()

        if existing_record:
            existing_buy_price, existing_sell_price = existing_record
            # Only update if the buy_price or sell_price has changed
            if existing_buy_price != buy_price or existing_sell_price != sell_price:
                cursor.execute('''
                    UPDATE data
                    SET buy_price = %s, sell_price = %s
                    WHERE item_id = %s AND timestamp = %s
                ''', (buy_price, sell_price, item_id, timestamp))
                print(f"Updated {item_id} at {timestamp}")
        else:
            # Insert a new record
            cursor.execute('''
                INSERT INTO data (item_id, buy_price, sell_price, timestamp)
                VALUES (%s, %s, %s, %s)
            ''', (item_id, buy_price, sell_price, int(timestamp)))
            print(f"Inserted {item_id} at {timestamp}")

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Database error: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# Fetch data for a specific item
def fetch_data(item_id):
    """Retrieve the latest data from the database."""
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cursor = conn.cursor()
        cursor.execute('''
            SELECT item_id, buy_price, sell_price, timestamp
            FROM data
            WHERE item_id = %s
            ORDER BY timestamp DESC
            LIMIT 1
        ''', (item_id,))
        data = cursor.fetchone()
        return data
    except Exception as e:
        print(f"Database error: {e}")
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# Fetch all data
def fetch_all_data():
    """Retrieve all data from the database."""
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cursor = conn.cursor()
        cursor.execute('SELECT item_id, buy_price, sell_price, timestamp FROM data')
        data = cursor.fetchall()
        return data
    except Exception as e:
        print(f"Database error: {e}")
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# Background thread to update data periodically
def start_background_thread():
    tracker = BazaarTracker()

    def background_data_updater():
        while True:
            try:
                tracker.update_data()
                for item_id, item_data in tracker.data.items():
                    save_data(item_id, item_data.get("buy_price", 0), item_data.get("sell_price", 0), time.time())
                print("Data successfully updated and saved to the database.")
            except Exception as e:
                print(f"Error updating data: {e}")
            time.sleep(60)  # Wait 60 seconds before the next update

    threading.Thread(target=background_data_updater, daemon=True).start()

# Initialize the PostgreSQL database
init_db()

# Start the background update thread
start_background_thread()