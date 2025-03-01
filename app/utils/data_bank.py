import os
import psycopg2
from bazaar_tracker import BazaarTracker

DATABASE_URL = os.environ.get("DATABASE_URL")

def init_db():
    conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    cursor = conn.cursor()
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS data (
                item_id TEXT PRIMARY KEY,
                buy_price REAL,
                sell_price REAL,
                timestamp BIGINT
            )
        ''')
        conn.commit()
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        cursor.close()
        conn.close()

init_db()

# Initialize the bazaar tracker to start pushing the data
bazaar_tracker = BazaarTracker()