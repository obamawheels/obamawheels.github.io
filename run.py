import matplotlib.pyplot as plt
import numpy as np
import time
import threading
from queue import Queue
from app import create_app
from bazaar_tracker import BazaarTracker

app = create_app()

plot_queue = Queue()

# Create the tracker instance with the plot queue
tracker = BazaarTracker(plot_queue=plot_queue)

def background_data_updater():
    while True:
        try:
            tracker.update_data()
        except KeyError as e:
            print(f"Error updating data: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")
        time.sleep(60)  # Wait 60 seconds before the next update

# Start the background thread
threading.Thread(target=background_data_updater, daemon=True).start()

def plot_median_prices(median_prices):
    """
    Plot the median buy and sell prices for each item.
    """
    items = list(median_prices.keys())
    median_buy_prices = [median_prices[item]["median_buy"] for item in items]
    median_sell_prices = [median_prices[item]["median_sell"] for item in items]

    x = np.arange(len(items))  # the label locations
    width = 0.35  # the width of the bars

    plt.ion()  # Enable interactive mode
    fig, ax = plt.subplots()
    rects1 = ax.bar(x - width/2, median_buy_prices, width, label='Median Buy Price')
    rects2 = ax.bar(x + width/2, median_sell_prices, width, label='Median Sell Price')

    # Add some text for labels, title and custom x-axis tick labels, etc.
    ax.set_xlabel('Items')
    ax.set_ylabel('Prices')
    ax.set_title('Median Buy and Sell Prices by Item')
    ax.set_xticks(x)
    ax.set_xticklabels(items, rotation=90)
    ax.legend()

    fig.tight_layout()
    plt.show()
    plt.pause(0.001)  # Pause to allow the plot to be updated

def plot_handler():
    while True:
        median_prices = plot_queue.get()
        if median_prices:
            plot_median_prices(median_prices)

# Start the plot handler thread
threading.Thread(target=plot_handler, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)

    #just a test
    