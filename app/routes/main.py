from flask import Blueprint, render_template, jsonify, request
from app.utils.data_bank import fetch_data
import time

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/data/<item_id>', methods=['GET'])
def get_item_data(item_id):
    data = fetch_data(item_id)
    if data:
        return jsonify({
            "item_id": data[0],
            "buy_price": data[1],
            "sell_price": data[2],
            "timestamp": data[3]
        })
    else:
        return jsonify({"error": "Item not found"}), 404

@main_bp.route('/graph-data')
def get_graph_data():
    item_name = request.args.get('item')
    time_range = request.args.get('range', 'all')  # Default to 'all' if not specified

    if not item_name:
        return jsonify({"error": "Item name is required"}), 400

    # Fetch historical data from the database
    historical_data = fetch_historical_data(item_name, time_range)

    if historical_data:
        return jsonify(historical_data)
    else:
        return jsonify({"error": "No historical data found for this item"}), 404

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
        elif time_range == '24h':
            query = "SELECT timestamp, buy_price, sell_price FROM data WHERE item_id = %s AND timestamp > %s ORDER BY timestamp"
            cutoff_timestamp = time.time() - (24 * 60 * 60)  # 24 hours ago
            params = (item_name, cutoff_timestamp)
        elif time_range == '7d':
            query = "SELECT timestamp, buy_price, sell_price FROM data WHERE item_id = %s AND timestamp > %s ORDER BY timestamp"
            cutoff_timestamp = time.time() - (7 * 24 * 60 * 60)  # 7 days ago
            params = (item_name, cutoff_timestamp)
        else:
            return None

        if time_range == 'all':
             params = (item_name,)
        cursor.execute(query, params)
        results = cursor.fetchall()

        # Format the data for the graph
        formatted_data = [{"timestamp": row[0], "buy_price": row[1], "sell_price": row[2]} for row in results]
        return formatted_data

    except Exception as e:
        print(f"Database error: {e}")
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()