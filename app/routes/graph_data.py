from flask import Blueprint, request, jsonify
from influxdb_client import InfluxDBClient
import time
import os

graph_data_bp = Blueprint('graph_data', __name__)

# InfluxDB Configuration (Read from environment variables)
INFLUXDB_URL = os.environ.get("INFLUXDB_URL")
INFLUXDB_ORG = os.environ.get("INFLUXDB_ORG")
INFLUXDB_BUCKET = os.environ.get("INFLUXDB_BUCKET")
INFLUXDB_TOKEN = os.environ.get("INFLUXDB_TOKEN")

@graph_data_bp.route('/graph-data', methods=['GET'])
def graph_data():
    """
    Return historical price data for a specific item within a specified time range from InfluxDB.
    """
    item_name = request.args.get('item', '').lower()
    time_range = request.args.get('range', 'all')

    try:
        client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
        query_api = client.query_api()

        # Build the Flux query
        query = f"""
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: -{get_influxdb_range(time_range)})
                |> filter(fn: (r) => r._measurement == "item_prices")
                 |> filter(fn: (r) => r.item_id == "{item_name}")
                |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)  // Aggregate into 1-minute windows
                |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                |> yield(name: "mean")
                """

        # Execute the query
        tables = query_api.query(query)

        # Process the results
        history = []
        for table in tables:
            for record in table.records:
                bp_value = record.values.get("buy_price")
                sp_value = record.values.get("sell_price")

                # Check the values and types
                print(f"Raw buy_price value: {bp_value}, Type: {type(bp_value)}")
                print(f"Raw sell_price value: {sp_value}, Type: {type(sp_value)}")

                # Append the data to the history list
                history.append({
                    "timestamp": record.get_time().timestamp(),  # Convert to Unix timestamp
                    "buy_price": bp_value,
                    "sell_price": sp_value
                })

        client.close()

        return jsonify(history)
    except Exception as e:
        print(f"Error fetching graph data from InfluxDB for item {item_name}: {e}")
        return jsonify({"error": "Failed to retrieve graph data. Please try again later."}), 500

def get_influxdb_range(time_range):
    """Convert frontend time range to InfluxDB-compatible duration."""
    ranges = {
        "1h": "1h",
        "24h": "24h",
        "1w": "7d",
        "1y": "365d",
        "all": "10000d"  # Fetch all data
    }
    return ranges.get(time_range, "30d")  # Default to 30d