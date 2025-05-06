import os
import csv
import threading
import time
import json
import logging
import requests
import numpy as np
import pandas as pd  # Use Pandas for fast CSV I/O and caching
from math import log
from datetime import datetime, timedelta
from flask import Flask, render_template, request, redirect, url_for, flash
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
import plotly.graph_objects as go
from plotly.offline import plot

# ===============================
# CONFIGURATION & LOGGING
# ===============================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

SNAPSHOT_FILE = "market_snapshot.csv"
SELL_SUMMARY_FILE = "sell_summary.csv"
BUY_SUMMARY_FILE = "buy_summary.csv"
TRACKED_FILE = "tracked_items.csv"  # For purchase/tracking data

API_URL = "https://api.hypixel.net/v2/skyblock/bazaar"

app = Flask(__name__)
app.secret_key = "bztracker.me"  # Change in production

# ===============================
# GLOBAL CACHES
# ===============================
CSV_CACHE = None  # Pandas DataFrame caching CSV data (snapshots)
CSV_CACHE_LOCK = threading.Lock()

# MODEL_CACHE: product_id -> (model, scaler, avg_dt, confidence)
MODEL_CACHE = {}
MODEL_LOCK = threading.Lock()

# ===============================
# CSV & DATA CACHING FUNCTIONS
# ===============================
def init_csv(file_path, headers):
    if not os.path.exists(file_path):
        try:
            with open(file_path, "w", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow(headers)
            logging.info(f"Initialized {file_path}")
        except Exception as e:
            logging.error(f"Error initializing {file_path}: {e}")

def load_csv_to_df(file_path):
    try:
        df = pd.read_csv(file_path)
        return df
    except Exception as e:
        logging.error(f"Error reading {file_path}: {e}")
        return pd.DataFrame()

def update_csv_cache():
    global CSV_CACHE
    while True:
        with CSV_CACHE_LOCK:
            CSV_CACHE = load_csv_to_df(SNAPSHOT_FILE)
        time.sleep(60)  # update cache every minute

threading.Thread(target=update_csv_cache, daemon=True).start()

def get_latest_snapshots():
    """Return a dict mapping product_id -> latest snapshot row (as dict) from CSV_CACHE."""
    with CSV_CACHE_LOCK:
        if CSV_CACHE is None or CSV_CACHE.empty:
            return {}
        df = CSV_CACHE.copy()
    try:
        df["snapshot_time"] = pd.to_datetime(df["snapshot_time"], format="%Y-%m-%d %H:%M:%S", errors='coerce')
    except Exception:
        return {}
    df = df.dropna(subset=["snapshot_time"])
    df.sort_values("snapshot_time", inplace=True)
    latest = df.groupby("product_id").tail(1)
    return latest.to_dict(orient="records")

def get_snapshots_for_product(product_id):
    """Return a sorted list of snapshots (as dicts) for product_id from CSV_CACHE."""
    with CSV_CACHE_LOCK:
        if CSV_CACHE is None or CSV_CACHE.empty:
            return []
        df = CSV_CACHE.copy()
    df["snapshot_time"] = pd.to_datetime(df["snapshot_time"], format="%Y-%m-%d %H:%M:%S", errors='coerce')
    df = df[df["product_id"] == product_id].dropna(subset=["snapshot_time"])
    df.sort_values("snapshot_time", inplace=True)
    return df.to_dict(orient="records")

def get_latest_snapshot(product_id):
    snaps = get_snapshots_for_product(product_id)
    return snaps[-1] if snaps else None

# ===============================
# DATA FETCHING (Background)
# ===============================
def fetch_and_log_data():
    init_csv(SNAPSHOT_FILE, ["snapshot_time", "product_id", "sellPrice", "buyPrice",
                               "sellVolume", "buyVolume", "sellMovingWeek", "buyMovingWeek",
                               "sellOrders", "buyOrders"])
    init_csv(SELL_SUMMARY_FILE, ["snapshot_time", "product_id", "pricePerUnit", "amount", "orders", "tier_rank"])
    init_csv(BUY_SUMMARY_FILE, ["snapshot_time", "product_id", "pricePerUnit", "amount", "orders", "tier_rank"])
    
    logging.info("Starting API data fetch loop...")
    while True:
        snapshot_time = datetime.now().isoformat(sep=" ", timespec="seconds")
        try:
            response = requests.get(API_URL, timeout=10)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            logging.error(f"Error fetching API data: {e}")
            time.sleep(120)
            continue
        products = data.get("products", {})
        try:
            with open(SNAPSHOT_FILE, "a", newline="", encoding="utf-8") as snap_f, \
                 open(SELL_SUMMARY_FILE, "a", newline="", encoding="utf-8") as sell_f, \
                 open(BUY_SUMMARY_FILE, "a", newline="", encoding="utf-8") as buy_f:
                snap_writer = csv.writer(snap_f)
                sell_writer = csv.writer(sell_f)
                buy_writer = csv.writer(buy_f)
                for pid, info in products.items():
                    quick = info.get("quick_status", {})
                    snap_writer.writerow([
                        snapshot_time, pid,
                        quick.get("sellPrice", 0.0),
                        quick.get("buyPrice", 0.0),
                        quick.get("sellVolume", 0),
                        quick.get("buyVolume", 0),
                        quick.get("sellMovingWeek", 0),
                        quick.get("buyMovingWeek", 0),
                        quick.get("sellOrders", 0),
                        quick.get("buyOrders", 0)
                    ])
                    for i, sell in enumerate(info.get("sell_summary", [])):
                        sell_writer.writerow([snapshot_time, pid,
                                              sell.get("pricePerUnit", 0.0),
                                              sell.get("amount", 0),
                                              sell.get("orders", 0), i])
                    for i, buy in enumerate(info.get("buy_summary", [])):
                        buy_writer.writerow([snapshot_time, pid,
                                             buy.get("pricePerUnit", 0.0),
                                             buy.get("amount", 0),
                                             buy.get("orders", 0), i])
                    logging.info(f"Logged data for {pid} at {snapshot_time}")
        except Exception as e:
            logging.error(f"Error writing CSVs: {e}")
        time.sleep(120)

threading.Thread(target=fetch_and_log_data, daemon=True).start()

# ===============================
# MODEL TRAINING & CACHING
# ===============================
def prepare_training_data(product_id, window_seconds=600):
    """Prepares training data for product_id using snapshots within a future window."""
    snapshots = get_snapshots_for_product(product_id)
    if not snapshots or len(snapshots) < 5:
        return None
    X, y, dt_diffs = [], [], []
    for row in snapshots:
        try:
            current_time = row["snapshot_time"].to_pydatetime() if isinstance(row["snapshot_time"], pd.Timestamp) else datetime.strptime(row["snapshot_time"], "%Y-%m-%d %H:%M:%S")
        except Exception:
            continue
        future = [r for r in snapshots if 0 < ( (r["snapshot_time"].to_pydatetime() if isinstance(r["snapshot_time"], pd.Timestamp) else datetime.strptime(r["snapshot_time"], "%Y-%m-%d %H:%M:%S")) - current_time).total_seconds() <= window_seconds]
        if not future:
            continue
        peak = max(future, key=lambda r: float(r["sellPrice"]))
        X.append([current_time.timestamp(), float(row["sellVolume"]), float(row["buyVolume"]), float(row["sellOrders"]), float(row["buyOrders"])])
        y.append(float(peak["sellPrice"]))
        dt_diffs.append(((peak["snapshot_time"].to_pydatetime() if isinstance(peak["snapshot_time"], pd.Timestamp) else datetime.strptime(peak["snapshot_time"], "%Y-%m-%d %H:%M:%S")) - current_time).total_seconds())
    if len(X) < 5:
        return None
    avg_dt = np.mean(dt_diffs)
    return np.array(X), np.array(y), avg_dt

def update_models_periodically():
    """Trains an MLPRegressor (with scaling) for each product and caches the model, scaler, avg_dt, and confidence."""
    while True:
        snapshots = get_latest_snapshots()
        product_ids = {row["product_id"] for row in snapshots}
        for pid in product_ids:
            data = prepare_training_data(pid, window_seconds=600)
            if data is None:
                continue
            X_train, y_train, avg_dt = data
            try:
                scaler = StandardScaler()
                X_scaled = scaler.fit_transform(X_train)
                model = MLPRegressor(hidden_layer_sizes=(64, 32, 16), max_iter=500, random_state=42)
                model.fit(X_scaled, y_train)
                score = model.score(X_scaled, y_train)
                confidence = max(0, min(100, score * 100))
                with MODEL_LOCK:
                    MODEL_CACHE[pid] = (model, scaler, avg_dt, confidence)
                logging.info(f"Updated model for {pid} (conf: {confidence:.2f}%)")
            except Exception as e:
                logging.error(f"Model training failed for {pid}: {e}")
        time.sleep(300)

threading.Thread(target=update_models_periodically, daemon=True).start()

# ===============================
# ADDITIONAL PREDICTION ROUTES
# ===============================
@app.route('/predict_trend/<product_id>')
def predict_trend(product_id):
    """Classify trend direction using linear regression on historical data."""
    snapshots = get_snapshots_for_product(product_id)
    if len(snapshots) < 5:
        return json.dumps({"error": "Insufficient data"})
    data = [(pd.to_datetime(r["snapshot_time"]).timestamp() if not isinstance(r["snapshot_time"], pd.Timestamp) else r["snapshot_time"].timestamp(), float(r["sellPrice"])) for r in snapshots]
    X = np.array([t for t, _ in data]).reshape(-1, 1)
    y = np.array([price for _, price in data])
    lr = LinearRegression().fit(X, y)
    slope = lr.coef_[0]
    trend = "sideways"
    if slope > 0.001:
        trend = "up"
    elif slope < -0.001:
        trend = "down"
    return json.dumps({"product_id": product_id, "trend": trend, "slope": slope})

@app.route('/time_to_target/<product_id>')
def time_to_target(product_id):
    """Simulate future predictions with the cached model to determine when a target price is reached."""
    target = request.args.get("target")
    if target is None:
        return json.dumps({"error": "No target specified"})
    try:
        target = float(target)
    except Exception:
        return json.dumps({"error": "Invalid target"})
    with MODEL_LOCK:
        entry = MODEL_CACHE.get(product_id)
    if entry is None:
        return json.dumps({"error": f"No model for {product_id}"})
    model, scaler, _, _ = entry
    latest = get_latest_snapshot(product_id)
    if latest is None:
        return json.dumps({"error": "No latest snapshot"})
    base_time = pd.to_datetime(latest["snapshot_time"]).timestamp() if not isinstance(latest["snapshot_time"], pd.Timestamp) else latest["snapshot_time"].timestamp()
    features_base = [float(latest["sellVolume"]), float(latest["buyVolume"]), float(latest["sellOrders"]), float(latest["buyOrders"])]
    horizon = 600
    step = 30
    future_times = np.arange(base_time, base_time + horizon + step, step)
    prediction_time = None
    for t in future_times:
        features = np.array([[t] + features_base])
        pred = model.predict(scaler.transform(features))[0]
        if pred >= target:
            prediction_time = t
            break
    if prediction_time is None:
        msg = f"Target price {target} not reached in next 10 minutes."
    else:
        dt_minutes = (prediction_time - base_time) / 60
        peak_time = datetime.fromtimestamp(prediction_time).strftime("%I:%M %p")
        msg = f"Target {target} expected at {peak_time} (in ~{dt_minutes:.1f} minutes)."
    return json.dumps({"product_id": product_id, "message": msg})

# ===============================
# PRIMARY ENDPOINTS
# ===============================
@app.route('/')
def index():
    snapshots = get_latest_snapshots()
    snapshots.sort(key=lambda r: r["product_id"])
    return render_template("index.html", snapshots=snapshots)

@app.route('/plot/<product_id>')
def plot_product(product_id):
    snapshots = get_snapshots_for_product(product_id)
    if not snapshots:
        return f"No data available for product: {product_id}"
    times = [pd.to_datetime(r["snapshot_time"]) for r in snapshots]
    sell_prices = [float(r["sellPrice"]) for r in snapshots]
    buy_prices = [float(r["buyPrice"]) for r in snapshots]
    sell_volumes = [int(r["sellVolume"]) for r in snapshots]
    buy_volumes = [int(r["buyVolume"]) for r in snapshots]

    fig_price = go.Figure()
    fig_price.add_trace(go.Scatter(x=times, y=sell_prices, mode="lines+markers", name="Sell Price"))
    fig_price.add_trace(go.Scatter(x=times, y=buy_prices, mode="lines+markers", name="Buy Price"))

    peak_info = ""
    with MODEL_LOCK:
        entry = MODEL_CACHE.get(product_id)
    if entry is not None:
        model, scaler, _, confidence = entry
        latest = get_latest_snapshot(product_id)
        if latest:
            base_time = pd.to_datetime(latest["snapshot_time"]).timestamp()
            features_base = [float(latest["sellVolume"]), float(latest["buyVolume"]), float(latest["sellOrders"]), float(latest["buyOrders"])]
            horizon = 600
            step = 30
            future_times = np.arange(base_time, base_time + horizon + step, step)
            future_dt = [datetime.fromtimestamp(t) for t in future_times]
            future_preds = [model.predict(scaler.transform(np.array([[t] + features_base])))[0] for t in future_times]
            fig_price.add_trace(go.Scatter(
                x=future_dt,
                y=future_preds,
                mode="lines",
                name="Predicted Trend"
            ))
            max_idx = int(np.argmax(future_preds))
            peak_price = future_preds[max_idx]
            peak_time = future_dt[max_idx]
            minutes_to_peak = (future_times[max_idx] - base_time) / 60
            fig_price.add_trace(go.Scatter(
                x=[peak_time],
                y=[peak_price + 0.1],
                mode="markers",
                marker=dict(size=12, symbol="star"),
                name=f"Expected Peak (Conf: {confidence:.2f}%)"
            ))
            peak_info = f"Expected peak: {peak_price + 0.1:.2f} coins at {peak_time.strftime('%I:%M %p')} (in ~{minutes_to_peak:.1f} minutes). Confidence: {confidence:.2f}%"
    
    fig_price.update_layout(title=f"Price Evolution for {product_id}",
                            xaxis_title="Time",
                            yaxis_title="Price",
                            hovermode="x unified")
    price_div = plot(fig_price, output_type="div", include_plotlyjs=True)

    # Sell Volume Graph
    fig_sell = go.Figure()
    fig_sell.add_trace(go.Scatter(x=times, y=sell_volumes, mode="lines+markers", name="Sell Volume"))
    fig_sell.update_layout(title=f"Sell Volume for {product_id}", xaxis_title="Time", yaxis_title="Volume")
    sell_vol_div = plot(fig_sell, output_type="div", include_plotlyjs=False)

    # Buy Volume Graph
    fig_buy = go.Figure()
    fig_buy.add_trace(go.Scatter(x=times, y=buy_volumes, mode="lines+markers", name="Buy Volume"))
    fig_buy.update_layout(title=f"Buy Volume for {product_id}", xaxis_title="Time", yaxis_title="Volume")
    buy_vol_div = plot(fig_buy, output_type="div", include_plotlyjs=False)

    return render_template("plot.html", product_id=product_id,
                           price_div=price_div,
                           sell_volume_div=sell_vol_div,
                           buy_volume_div=buy_vol_div,
                           peak_info=peak_info)

@app.route('/predict/<product_id>')
def predict_product(product_id):
    with MODEL_LOCK:
        entry = MODEL_CACHE.get(product_id)
    if entry is None:
        return json.dumps({"error": f"Model not available for {product_id}"})
    model, scaler, avg_dt, confidence = entry
    latest = get_latest_snapshot(product_id)
    if latest is None:
        return json.dumps({"error": f"No latest data for {product_id}"})
    features = [pd.to_datetime(latest["snapshot_time"]).timestamp(), float(latest["sellVolume"]), float(latest["buyVolume"]),
                float(latest["sellOrders"]), float(latest["buyOrders"])]
    predicted_peak = model.predict(scaler.transform(np.array(features).reshape(1, -1)))[0]
    return json.dumps({
        "product_id": product_id,
        "predicted_peak_price": predicted_peak,
        "estimated_time_sec": avg_dt,
        "confidence": confidence
    })

@app.route('/investments')
def investments():
    snapshots = get_latest_snapshots()
    investments_list = []
    for row in snapshots:
        try:
            current_sell = float(row["sellPrice"])
            volume = float(row["sellVolume"])
            pid = row["product_id"]
            with MODEL_LOCK:
                entry = MODEL_CACHE.get(pid)
            if entry is None:
                continue
            model, scaler, avg_dt, confidence = entry
            latest = get_latest_snapshot(pid)
            if not latest:
                continue
            features = [pd.to_datetime(latest["snapshot_time"]).timestamp(), float(latest["sellVolume"]), float(latest["buyVolume"]),
                        float(latest["sellOrders"]), float(latest["buyOrders"])]
            predicted_peak = model.predict(scaler.transform(np.array(features).reshape(1, -1)))[0]
            real_price = predicted_peak + 0.1
            if current_sell >= real_price:
                continue
            margin = real_price - current_sell
            score = margin * confidence * log(volume + 1)
            investments_list.append({
                "product_id": pid,
                "current_sell_price": current_sell,
                "predicted_peak_price": round(predicted_peak, 2),
                "real_price": round(real_price, 2),
                "confidence": round(confidence, 2),
                "investment_score": round(score, 2)
            })
        except Exception as ex:
            logging.error(f"Error processing {row.get('product_id')}: {ex}")
            continue
    top_investments = sorted(investments_list, key=lambda x: x["investment_score"], reverse=True)[:10]
    return render_template("investments.html", investments=top_investments)

@app.route('/buy_investment/<product_id>', methods=["GET", "POST"])
def buy_investment(product_id):
    if request.method == "POST":
        try:
            quantity = float(request.form.get("quantity"))
            latest = get_latest_snapshot(product_id)
            if not latest:
                flash("No current data for product.", "danger")
                return redirect(url_for("investments"))
            current_sell = float(latest["sellPrice"])
            buy_price = current_sell + 0.1
            with MODEL_LOCK:
                entry = MODEL_CACHE.get(product_id)
            if entry is None:
                flash("Model not available.", "danger")
                return redirect(url_for("investments"))
            model, scaler, _, _ = entry
            features = [pd.to_datetime(latest["snapshot_time"]).timestamp(), float(latest["sellVolume"]), float(latest["buyVolume"]),
                        float(latest["sellOrders"]), float(latest["buyOrders"])]
            predicted_peak = model.predict(scaler.transform(np.array(features).reshape(1, -1)))[0]
            target_sell = predicted_peak + 0.1
            with open(TRACKED_FILE, "a", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow([datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                         product_id, quantity, buy_price, round(target_sell, 2), "N/A"])
            flash(f"Bought {quantity} of {product_id} at {buy_price} coins.", "success")
            return redirect(url_for("tracked"))
        except Exception as e:
            flash(f"Error processing purchase: {e}", "danger")
            return redirect(url_for("investments"))
    return render_template("buy_investment.html", product_id=product_id)

@app.route('/tracked')
def tracked():
    tracked_items = pd.read_csv(TRACKED_FILE)
    for row in tracked_items:
        try:
            t = datetime.strptime(row["purchase_time"], "%Y-%m-%d %H:%M:%S")
            row["purchase_time"] = t.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            continue
    return render_template("tracked.html", tracked_items=tracked_items)

@app.route('/top')
def top_variations():
    df = load_csv_to_df(SNAPSHOT_FILE)
    if df.empty:
        return "No data available."
    df["snapshot_time"] = pd.to_datetime(df["snapshot_time"], format="%Y-%m-%d %H:%M:%S", errors="coerce")
    df = df.dropna(subset=["snapshot_time"])
    variations = []
    compare_mode = request.args.get("compare", "").lower()
    now = datetime.now()
    
    if compare_mode == "2min":
        target_time = now - timedelta(minutes=2)
        for pid, group in df.groupby("product_id"):
            group_sorted = group.sort_values("snapshot_time")
            if len(group_sorted) < 2:
                continue
            prev = group_sorted.iloc[(group_sorted["snapshot_time"] - target_time).abs().argsort()].iloc[0]
            latest = group_sorted.iloc[-1]
            if prev["snapshot_time"] >= latest["snapshot_time"]:
                continue
            raw_margin = latest["sellPrice"] - prev["sellPrice"]
            perc = (raw_margin / prev["sellPrice"] * 100) if prev["sellPrice"] else 0
            variations.append({
                "product_id": pid,
                "previous_price": prev["sellPrice"],
                "current_price": latest["sellPrice"],
                "raw_margin": raw_margin,
                "percentage_variation": perc,
                "snapshot_time": latest["snapshot_time"].strftime("%Y-%m-%d %H:%M:%S")
            })
        variations.sort(key=lambda x: abs(x["percentage_variation"]), reverse=True)
    else:
        time_filter = request.args.get("time_filter", "all").lower()
        time_deltas = {"minute": timedelta(minutes=2), "hour": timedelta(hours=1),
                       "day": timedelta(days=1), "week": timedelta(weeks=1),
                       "month": timedelta(days=30), "year": timedelta(days=365), "all": None}
        delta = time_deltas.get(time_filter)
        if delta:
            cutoff = now - delta
            df = df[df["snapshot_time"] >= cutoff]
        for pid, group in df.groupby("product_id"):
            group_sorted = group.sort_values("snapshot_time")                                                                   
            if len(group_sorted) < 2:
                continue
            first = group_sorted.iloc[0]
            last = group_sorted.iloc[-1]
            raw_margin = last["sellPrice"] - first["sellPrice"]
            perc = (raw_margin / first["sellPrice"] * 100) if first["sellPrice"] else 0
            variations.append({
                "product_id": pid,
                "previous_price": first["sellPrice"],
                "current_price": last["sellPrice"],
                "raw_margin": raw_margin,
                "percentage_variation": perc,
                "snapshot_time": last["snapshot_time"].strftime("%Y-%m-%d %H:%M:%S")
            })
        sort_by = request.args.get("sort_by", "percentage_variation")
        sort_order = request.args.get("sort_order", "desc")
        variations.sort(key=lambda x: x.get(sort_by, 0), reverse=(sort_order=="desc"))
    
    try:
        min_perc = float(request.args.get("min_percentage", 0))
    except Exception:
        min_perc = 0
    try:
        min_margin = float(request.args.get("min_margin", 0))
    except Exception:
        min_margin = 0
    variations = [v for v in variations if abs(v["percentage_variation"]) >= min_perc and abs(v["raw_margin"]) >= min_margin]
    top_variations = variations[:100]
    return render_template("top.html", variations=top_variations,
                           current_filter=request.args.get("time_filter", "all"),
                           compare_mode=compare_mode)

if __name__ == '__main__':
    app.run(debug=True)