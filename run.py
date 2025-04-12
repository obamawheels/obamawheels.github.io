import os
import csv
import threading
import time
import json
import logging
import requests
import io
import base64
import numpy as np
from sklearn.linear_model import LinearRegression
import time

# Import Plotly modules for interactive graphs.
import plotly.graph_objects as go
from plotly.offline import plot

# Import the Flask framework.
from flask import Flask, render_template, request

# Import datetime and timedelta directly from the datetime module.
from datetime import datetime, timedelta

# Setup basic logging.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# CSV filenames.
SNAPSHOT_FILE = "market_snapshot.csv"
SELL_SUMMARY_FILE = "sell_summary.csv"
BUY_SUMMARY_FILE = "buy_summary.csv"
API_URL = "https://api.hypixel.net/v2/skyblock/bazaar"

def init_csv(file_path, headers):
    """Create a CSV file with the specified headers if it doesn't exist."""
    if not os.path.exists(file_path):
        try:
            with open(file_path, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(headers)
            logging.info(f"Initialized {file_path}")
        except Exception as e:
            logging.error(f"Error initializing {file_path}: {e}")

def fetch_and_log_data():
    logging.info("Starting data fetch loop...")

    """
    Every 2 minutes, fetch data from the API and write:
      1) Snapshot metrics into market_snapshot.csv,
      2) Detailed sell orders (with tier_rank) into sell_summary.csv,
      3) Detailed buy orders (with tier_rank) into buy_summary.csv.
    """
    # Initialize CSV files.
    init_csv(
        SNAPSHOT_FILE,
        ["snapshot_time", "product_id", "sellPrice", "buyPrice",
         "sellVolume", "buyVolume", "sellMovingWeek", "buyMovingWeek",
         "sellOrders", "buyOrders"]
    )
    init_csv(
        SELL_SUMMARY_FILE,
        ["snapshot_time", "product_id", "pricePerUnit", "amount", "orders", "tier_rank"]
    )
    init_csv(
        BUY_SUMMARY_FILE,
        ["snapshot_time", "product_id", "pricePerUnit", "amount", "orders", "tier_rank"]
    )

    while True:
        snapshot_time = datetime.now().isoformat(sep=" ", timespec="seconds")
        try:
            response = requests.get(API_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            logging.error(f"Error fetching data: {e}")
            time.sleep(120)
            continue

        products = data.get("products", {})

        try:
            with open(SNAPSHOT_FILE, mode="a", newline="", encoding="utf-8") as snap_f, \
                 open(SELL_SUMMARY_FILE, mode="a", newline="", encoding="utf-8") as sell_f, \
                 open(BUY_SUMMARY_FILE, mode="a", newline="", encoding="utf-8") as buy_f:

                snapshot_writer = csv.writer(snap_f)
                sell_writer = csv.writer(sell_f)
                buy_writer = csv.writer(buy_f)

                for product_id, product_info in products.items():
                    quick_status = product_info.get("quick_status", {})

                    # Write snapshot row.
                    snapshot_writer.writerow([
                        snapshot_time,
                        product_id,
                        quick_status.get("sellPrice", 0.0),
                        quick_status.get("buyPrice", 0.0),
                        quick_status.get("sellVolume", 0),
                        quick_status.get("buyVolume", 0),
                        quick_status.get("sellMovingWeek", 0),
                        quick_status.get("buyMovingWeek", 0),
                        quick_status.get("sellOrders", 0),
                        quick_status.get("buyOrders", 0)
                    ])

                    # Write sell_summary with tier_rank.
                    for i, sell in enumerate(product_info.get("sell_summary", [])):
                        sell_writer.writerow([
                            snapshot_time,
                            product_id,
                            sell.get("pricePerUnit", 0.0),
                            sell.get("amount", 0),
                            sell.get("orders", 0),
                            i  # tier rank
                        ])

                    # Write buy_summary with tier_rank.
                    for i, buy in enumerate(product_info.get("buy_summary", [])):
                        buy_writer.writerow([
                            snapshot_time,
                            product_id,
                            buy.get("pricePerUnit", 0.0),
                            buy.get("amount", 0),
                            buy.get("orders", 0),
                            i  # tier rank
                        ])

                    logging.info(f"Logged data for {product_id} at {snapshot_time}")
        except Exception as e:
            logging.error(f"Error writing to CSV: {e}")

        time.sleep(120)

# Start the data-fetching thread.
threading.Thread(target=fetch_and_log_data, daemon=True).start()

# Initialize the Flask app.
app = Flask(__name__)

def get_latest_snapshots():
    """
    Reads market_snapshot.csv and returns the most recent row for each product.
    """
    if not os.path.exists(SNAPSHOT_FILE):
        return []

    rows_by_product = {}
    with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                dt = datetime.strptime(row["snapshot_time"], "%Y-%m-%d %H:%M:%S")
            except Exception:
                continue
            product = row["product_id"]
            if product not in rows_by_product or dt > rows_by_product[product][0]:
                rows_by_product[product] = (dt, row)
    return [info[1] for info in rows_by_product.values()]

@app.route('/')
def index():
    latest_data = get_latest_snapshots()
    latest_data.sort(key=lambda row: row["product_id"])
    # No need to pass now=datetime.now() because it's injected globally.
    return render_template("index.html", snapshots=latest_data)

# Global injection of the current time.
@app.context_processor
def inject_now():
    return {'now': datetime.now}
@app.route('/plot/<product_id>')
def plot_product(product_id):
    """
    Build interactive Plotly graphs for the selected product:
      - A Price Graph (sell and buy prices, with extended predicted trends for both),
      - A Sell Volume Graph, and
      - A Buy Volume Graph.
    """
    times = []
    sell_prices = []
    buy_prices = []
    sell_volumes = []
    buy_volumes = []

    # Read historical data for the product.
    if os.path.exists(SNAPSHOT_FILE):
        try:
            with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row["product_id"] == product_id:
                        try:
                            dt = datetime.strptime(row["snapshot_time"], "%Y-%m-%d %H:%M:%S")
                        except Exception:
                            continue
                        times.append(dt)
                        sell_prices.append(float(row["sellPrice"]))
                        buy_prices.append(float(row["buyPrice"]))
                        sell_volumes.append(int(row["sellVolume"]))
                        buy_volumes.append(int(row["buyVolume"]))
        except Exception as e:
            return f"Error reading CSV: {e}"

    if not times:
        return f"No data available for product: {product_id}"

    # Sort historical data by time.
    sorted_data = sorted(zip(times, sell_prices, buy_prices, sell_volumes, buy_volumes), key=lambda x: x[0])
    times, sell_prices, buy_prices, sell_volumes, buy_volumes = zip(*sorted_data)

    # Create the Price Graph with historical sell and buy prices.
    fig_price = go.Figure()
    fig_price.add_trace(go.Scatter(
        x=list(times),
        y=list(sell_prices),
        mode="lines+markers",
        name="Sell Price"
    ))
    fig_price.add_trace(go.Scatter(
        x=list(times),
        y=list(buy_prices),
        mode="lines+markers",
        name="Buy Price"
    ))

    # Prediction logic: Only if there are enough data points.
    if len(times) >= 5:
        import numpy as np
        from sklearn.linear_model import LinearRegression

        # Convert datetime values to UNIX timestamps.
        X = np.array([dt.timestamp() for dt in times]).reshape(-1, 1)
        
        # Build and train the regression models for sell and buy prices.
        sell_y = np.array(sell_prices)
        sell_model = LinearRegression()
        sell_model.fit(X, sell_y)

        buy_y = np.array(buy_prices)
        buy_model = LinearRegression()
        buy_model.fit(X, buy_y)

        # Define the prediction extension.
        # Here, we extend the prediction for 1 hour (3600 seconds) beyond the last data point.
        extension_duration = 3600  # seconds, adjust this value as needed
        num_pred_points = 60       # number of points in the prediction line (e.g., 1 point per minute)
        last_timestamp = times[-1].timestamp()
        predicted_range = np.linspace(last_timestamp, last_timestamp + extension_duration, num=num_pred_points)
        predicted_times = [datetime.fromtimestamp(ts) for ts in predicted_range]

        # Calculate predicted sell and buy price trends.
        predicted_sell_line = sell_model.predict(predicted_range.reshape(-1, 1))
        predicted_buy_line = buy_model.predict(predicted_range.reshape(-1, 1))

        # Compute the confidence scores using the R² metric (scaled to 0-100) for each model.
        sell_score = sell_model.score(X, sell_y)
        buy_score = buy_model.score(X, buy_y)
        sell_confidence = max(0, min(100, sell_score * 100))
        buy_confidence = max(0, min(100, buy_score * 100))

        # Add the predicted sell trend as a continuous line.
        fig_price.add_trace(go.Scatter(
            x=predicted_times,
            y=predicted_sell_line,
            mode="lines",
            name=f"Predicted Sell Trend (Confidence: {sell_confidence:.2f}%)"
        ))
        # Add the predicted buy trend as a continuous line.
        fig_price.add_trace(go.Scatter(
            x=predicted_times,
            y=predicted_buy_line,
            mode="lines",
            name=f"Predicted Buy Trend (Confidence: {buy_confidence:.2f}%)"
        ))

    fig_price.update_layout(
        title=f"Price Evolution for {product_id}",
        xaxis_title="Snapshot Time",
        yaxis_title="Price",
        hovermode="x unified"
    )
    price_div = plot(fig_price, output_type="div", include_plotlyjs=False)

    # Create Sell Volume Graph.
    fig_sell_volume = go.Figure()
    fig_sell_volume.add_trace(go.Scatter(
        x=list(times),
        y=list(sell_volumes),
        mode="lines+markers",
        name="Sell Volume"
    ))
    fig_sell_volume.update_layout(
        title=f"Sell Volume Evolution for {product_id}",
        xaxis_title="Snapshot Time",
        yaxis_title="Sell Volume",
        hovermode="x unified"
    )
    sell_volume_div = plot(fig_sell_volume, output_type="div", include_plotlyjs=False)

    # Create Buy Volume Graph.
    fig_buy_volume = go.Figure()
    fig_buy_volume.add_trace(go.Scatter(
        x=list(times),
        y=list(buy_volumes),
        mode="lines+markers",
        name="Buy Volume"
    ))
    fig_buy_volume.update_layout(
        title=f"Buy Volume Evolution for {product_id}",
        xaxis_title="Snapshot Time",
        yaxis_title="Buy Volume",
        hovermode="x unified"
    )
    buy_volume_div = plot(fig_buy_volume, output_type="div", include_plotlyjs=False)

    return render_template("plot.html",
                           product_id=product_id,
                           price_div=price_div,
                           sell_volume_div=sell_volume_div,
                           buy_volume_div=buy_volume_div)
@app.route('/top')
def top_variations():
    """
    Compute top variations for products using one of two modes.
    
    Modes:
      - 2min Compare Mode (if query parameter compare=2min is provided):
          Compares the snapshot closest to 2 minutes ago with the latest snapshot.
      - Time Filter Mode (default):
          Uses the time_filter query parameter (e.g. "minute", "hour", "day", "week",
          "month", "year", or "all") to limit snapshots to a recent window and compares
          the earliest snapshot within the window with the latest snapshot.
    
    Optional query parameters:
      - min_percentage: Minimum absolute percentage variation (default 0)
      - min_margin: Minimum absolute raw margin (default 0)
      - For Time Filter Mode:
            sort_by: The key to sort the variations by (default "percentage_variation")
            sort_order: "asc" or "desc" (default "desc")
    """
    if not os.path.exists(SNAPSHOT_FILE):
        return "No data available."

    compare_mode = request.args.get("compare", "").lower()
    variations = []

    if compare_mode == "2min":
        # --- 2min Compare Mode ---
        snapshots_by_product = {}
        with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                product = row["product_id"]
                try:
                    dt = datetime.strptime(row["snapshot_time"], "%Y-%m-%d %H:%M:%S")
                    sell_price = float(row["sellPrice"])
                except Exception:
                    continue
                snapshots_by_product.setdefault(product, []).append((dt, sell_price))
        
        now = datetime.now()
        target_time = now - timedelta(minutes=2)
        
        for product, data in snapshots_by_product.items():
            if len(data) < 2:
                continue
            
            # Sort by time (oldest first)
            data_sorted = sorted(data, key=lambda x: x[0])
            # Find the snapshot closest to 2 minutes ago
            prev = min(data_sorted, key=lambda x: abs((x[0] - target_time).total_seconds()))
            latest = max(data_sorted, key=lambda x: x[0])
            
            # Ensure the earlier snapshot is before the latest snapshot.
            if prev[0] >= latest[0]:
                continue
            
            raw_margin = latest[1] - prev[1]
            perc_var = (raw_margin / prev[1] * 100) if prev[1] != 0 else 0
            variations.append({
                "product_id": product,
                "previous_price": prev[1],
                "current_price": latest[1],
                "raw_margin": raw_margin,
                "percentage_variation": perc_var,
                "snapshot_time": latest[0].strftime("%Y-%m-%d %H:%M:%S")
            })
        
        # Sort variations in descending order by absolute percentage variation.
        variations.sort(key=lambda x: abs(x["percentage_variation"]), reverse=True)

    else:
        # --- Time Filter Mode ---
        time_filter = request.args.get("time_filter", "all").lower()
        now = datetime.now()
        time_deltas = {
            "minute": timedelta(minutes=2),
            "hour": timedelta(hours=1),
            "day": timedelta(days=1),
            "week": timedelta(weeks=1),
            "month": timedelta(days=30),
            "year": timedelta(days=365),
            "all": None
        }
        delta = time_deltas.get(time_filter, None)
        cutoff = now - delta if delta is not None else None

        snapshots_by_product = {}
        with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                product = row["product_id"]
                try:
                    dt = datetime.strptime(row["snapshot_time"], "%Y-%m-%d %H:%M:%S")
                    sell_price = float(row["sellPrice"])
                except Exception:
                    continue
                if cutoff and dt < cutoff:
                    continue
                snapshots_by_product.setdefault(product, []).append((dt, sell_price))
        
        for product, data in snapshots_by_product.items():
            if len(data) < 2:
                continue
            data_sorted = sorted(data, key=lambda x: x[0])
            first_time, first_price = data_sorted[0]
            last_time, last_price = data_sorted[-1]
            raw_margin = last_price - first_price
            perc_var = (raw_margin / first_price * 100) if first_price != 0 else 0
            variations.append({
                "product_id": product,
                "previous_price": first_price,
                "current_price": last_price,
                "raw_margin": raw_margin,
                "percentage_variation": perc_var,
                "snapshot_time": last_time.strftime("%Y-%m-%d %H:%M:%S")
            })
        
        # Optional sorting for Time Filter Mode.
        sort_by = request.args.get("sort_by", "percentage_variation")
        sort_order = request.args.get("sort_order", "desc")
        variations.sort(key=lambda x: x.get(sort_by, 0), reverse=(sort_order == "desc"))
    
    # Optional filtering based on minimum thresholds.
    try:
        min_percentage = float(request.args.get("min_percentage", 0))
    except Exception:
        min_percentage = 0

    try:
        min_margin = float(request.args.get("min_margin", 0))
    except Exception:
        min_margin = 0

    variations = [
        v for v in variations
        if abs(v["percentage_variation"]) >= min_percentage and abs(v["raw_margin"]) >= min_margin
    ]

    top_variations = variations[:100]

    return render_template("top.html", variations=top_variations,
                           current_filter=request.args.get("time_filter", "all"),
                           compare_mode=compare_mode)
@app.route('/predict/<product_id>')
def predict_product(product_id):
    """
    Predicts the next sell price for a given product using historical snapshot data.
    Returns a JSON with:
      - predicted_sell_price: The forecasted sell price (using linear regression).
      - confidence: A rudimentary confidence score based on the model's R² metric (0 to 100).
    
    Note: This is a simple prediction model. For a production system, you may want to
    incorporate more features and a more robust forecasting method.
    """
    try:
        data_points = []
        # Read historical snapshots for the given product_id.
        with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row["product_id"] == product_id:
                    try:
                        dt = datetime.strptime(row["snapshot_time"], "%Y-%m-%d %H:%M:%S")
                        sell_price = float(row["sellPrice"])
                        data_points.append((dt, sell_price))
                    except Exception:
                        continue
        
        # Ensure there are enough data points to build a model.
        if len(data_points) < 5:
            return f"Not enough data for product {product_id} to make a prediction. Need at least 5 data points."
        
        # Sort data by time.
        data_points.sort(key=lambda x: x[0])
        
        # Prepare the data: Convert times to UNIX timestamps for regression.
        X = np.array([dp[0].timestamp() for dp in data_points]).reshape(-1, 1)
        y = np.array([dp[1] for dp in data_points])
        
        # Train the linear regression model.
        model = LinearRegression()
        model.fit(X, y)
        
        # Define the prediction time: e.g. last recorded time plus 2 minutes (120 seconds).
        last_time = data_points[-1][0]
        future_time = last_time.timestamp() + 120  # Predict 2 minutes ahead.
        prediction = model.predict(np.array([[future_time]]))[0]
        
        # Use the model's R² score (scaled to 0-100) as a confidence measure.
        score = model.score(X, y)
        confidence = max(0, min(100, score * 100))
        
        # Build and return the prediction result.
        result = {
            "product_id": product_id,
            "predicted_sell_price": prediction,
            "confidence": confidence
        }
        return json.dumps(result)
    
    except Exception as e:
        return f"Prediction error for product {product_id}: {e}"


if __name__ == '__main__':
    app.run(debug=True)