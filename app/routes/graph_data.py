from flask import Blueprint, request, jsonify, current_app
from influxdb_client import InfluxDBClient
import time
import os

graph_data_bp = Blueprint('graph_data', __name__)

# InfluxDB Configuration (Read from environment variables)
INFLUXDB_URL = os.environ.get("INFLUXDB_URL")
INFLUXDB_ORG = os.environ.get("INFLUXDB_ORG")
INFLUXDB_BUCKET = os.environ.get("INFLUXDB_BUCKET")
INFLUXDB_TOKEN = os.environ.get("INFLUXDB_TOKEN")

# Define the time range mapping function at module level to avoid duplication
def get_influxdb_range(range_str):
    """Convert user-friendly time range to InfluxDB duration format"""
    ranges = {
        '1h': '1h',
        '6h': '6h',
        '24h': '24h',
        '1d': '1d',
        '7d': '7d',
        '1w': '7d',
        '30d': '30d',
        '90d': '90d',
        '1y': '365d',
        'all': '10000d'  # Using a large value to represent "all" data
    }
    return ranges.get(range_str, '30d')  # Default to 30 days if invalid range

# Determine appropriate window size based on time range
def get_window_size(range_str):
    """Get appropriate aggregation window size for the time range"""
    windows = {
        '1h': '1m',    # 1 minute for 1 hour
        '6h': '5m',    # 5 minutes for 6 hours
        '24h': '15m',  # 15 minutes for 24 hours
        '1d': '15m',   # 15 minutes for 1 day
        '7d': '1h',    # 1 hour for 1 week
        '1w': '1h',    # 1 hour for 1 week
        '30d': '6h',   # 6 hours for 1 month
        '90d': '1d',   # 1 day for 3 months
        '1y': '1d',    # 1 day for 1 year
        'all': '1d'    # 1 day for all time
    }
    return windows.get(range_str, '1h')  # Default to 1 hour if invalid

@graph_data_bp.route('/graph-data', methods=['GET'])
def graph_data():
    """
    Return historical price data for a specific item within a specified time range from InfluxDB.
    """
    # Validate required parameters
    item_name = request.args.get('item')
    if not item_name:
        return jsonify({"error": "Missing required parameter: 'item'"}), 400
    
    # Sanitize input
    item_name = item_name.lower().strip()
    time_range = request.args.get('range', 'all')
    
    try:
        # Check if InfluxDB configuration exists
        if not all([INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET]):
            current_app.logger.error("Missing InfluxDB configuration")
            return jsonify({"error": "Database configuration error"}), 500
            
        client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
        query_api = client.query_api()
        
        # Get appropriate window size
        window_size = get_window_size(time_range)
        time_period = get_influxdb_range(time_range)
        
        # Build the Flux query using parameters to prevent injection
        query = f"""
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: -{time_period})
                |> filter(fn: (r) => r._measurement == "item_prices")
                |> filter(fn: (r) => r.item_id == "{item_name}")
                |> aggregateWindow(every: {window_size}, fn: mean, createEmpty: false)
                |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                |> yield(name: "mean")
        """
        
        # Execute the query
        tables = query_api.query(query)
        
        # Process the results
        history = []
        for table in tables:
            for record in table.records:
                # Safely get values with None as default
                bp_value = record.values.get("buy_price")
                sp_value = record.values.get("sell_price")
                
                # Only log unusual data during development
                if bp_value is None or sp_value is None:
                    current_app.logger.debug(
                        f"Missing price data for {item_name} at {record.get_time()}: "
                        f"buy_price={bp_value}, sell_price={sp_value}"
                    )
                
                # Convert any None values to null for JSON compatibility
                history.append({
                    "timestamp": record.get_time().timestamp(),  # Convert to Unix timestamp
                    "buy_price": bp_value,
                    "sell_price": sp_value
                })
        
        client.close()
        
        # Return data with appropriate metadata
        return jsonify({
            "item": item_name,
            "time_range": time_range,
            "points": len(history),
            "window_size": window_size,
            "data": history
        })
    
    except Exception as e:
        current_app.logger.error(f"Error fetching graph data from InfluxDB for item {item_name}: {e}")
        return jsonify({"error": "Failed to retrieve graph data. Please try again later."}), 500
