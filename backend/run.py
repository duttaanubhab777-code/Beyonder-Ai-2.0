from beyonder import create_app

app = create_app()

if __name__ == "__main__":
    # 0.0.0.0 দেওয়া হলো যাতে মোবাইলের লোকাল নেটওয়ার্কেও এটি কাজ করে
    app.run(host="0.0.0.0", port=5000, debug=True)
