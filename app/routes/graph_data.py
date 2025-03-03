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
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
              |> yield(name: "mean")
        """

        # Execute the query
        tables = query_api.query(query)
        print (f"These are my tables:{tables}") #print the tables.

        # Process the results
        history = []
        for table in tables:
            print (f"This is what is in table{table}")
            for record in table.records:
                history.append({
                    "timestamp": record.get_time().timestamp(),  # Convert to Unix timestamp
                    "buy_price": record.get_value_by_key("buy_price"),
                    "sell_price": record.get_value_by_key("sell_price")
                })

        client.close()
        print (f"This is my history object{history}")

        return jsonify(history)
    except Exception as e:
        print(f"Error fetching graph data from InfluxDB for item {item_name}: {e}")
        return jsonify({"error": "Failed to retrieve graph data. Please try again later."}), 500

def get_influxdb_range(time_range):
    """
    Helper function to convert the time range parameter to an InfluxDB range string.
    """
    if time_range == "1h":
        return "1h"
    elif time_range == "24h":
        return "24h"
    else:
        return "30d"  # Default to 30 days if 'all' or invalid range