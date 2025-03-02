from flask import Blueprint, request, jsonify
import time
from app.utils.data_bank import fetch_data

graph_data_bp = Blueprint('graph_data', __name__)

@graph_data_bp.route('/graph-data', methods=['GET'])
def graph_data():
    """
    Return historical price data for a specific item within a specified time range.
    """
    item_name = request.args.get('item', '').lower()
    time_range = request.args.get('range', 'all')

    try:
        #history = fetch_item_history(item_name) #Deleted this
        history = fetch_historical_data(item_name, time_range)
        if not history:
            return jsonify({"error": "Item not found"}), 404

        return jsonify(history) #Changed variable name, and changed to use this dataset

    except Exception as e:
        # Log the error for debugging
        print(f"Error fetching graph data for item {item_name}: {e}")
        return jsonify({"error": "Failed to retrieve graph data. Please try again later."}), 500


def fetch_historical_data(item_name, time_range):
    """
    Fetches historical data for a given item from the database.
    """
    import psycopg2
    import os
    DATABASE_URL = os.environ.get("DATABASE_URL")
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        cursor = conn.cursor()

        # Adjust the query based on the time range
        if time_range == 'all':
            query = "SELECT timestamp, buy_price, sell_price FROM data WHERE item_id = %s ORDER BY timestamp"
            params = (item_name,)
        elif time_range == '24h':
            query = "SELECT timestamp, buy_price, sell_price FROM data WHERE item_id = %s AND timestamp > %s ORDER BY timestamp"
            cutoff_timestamp = time.time() - (24 * 60 * 60)  # 24 hours ago
            params = (item_name, cutoff_timestamp)
        elif time_range == '7d':
            query = "SELECT timestamp, buy_price, sell_price FROM data WHERE item_id = %s AND timestamp > %s ORDER BY timestamp"
            cutoff_timestamp = time.time() - (7 * 24 * 60 * 60)  # 7 days ago
            params = (item_name, cutoff_timestamp)
        elif time_range == '1h':
            query = "SELECT timestamp, buy_price, sell_price FROM data WHERE item_id = %s AND timestamp > %s ORDER BY timestamp"
            cutoff_timestamp = time.time() - (1 * 60 * 60)  # 1 hours ago
            params = (item_name, cutoff_timestamp)
        else:
            return None

        cursor.execute(query, params)
        results = cursor.fetchall()

        # Format the data for the graph
        formatted_data = [{"timestamp": row[0] * 1000, "buy_price": row[1], "sell_price": row[2]} for row in results]
        return formatted_data

    except Exception as e:
        print(f"Database error: {e}")
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()