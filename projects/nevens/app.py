from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
import os
import sqlite3
import time as pytime

app = Flask(__name__)

STATIC_UPLOAD_SUBDIR = os.path.join("uploads", "menu")
ALLOWED_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp", "gif"}


def is_allowed_image(filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_IMAGE_EXTS


def ensure_upload_dir() -> str:
    upload_dir = os.path.join(app.root_path, "static", STATIC_UPLOAD_SUBDIR)
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir

def ensure_schema(conn):
    changed = False
    cols = conn.execute("PRAGMA table_info(menu)").fetchall()
    col_names = [col[1] for col in cols]
    if "food_type" not in col_names:
        conn.execute("ALTER TABLE menu ADD COLUMN food_type TEXT DEFAULT 'veg'")
        changed = True
    if "image_path" not in col_names:
        conn.execute("ALTER TABLE menu ADD COLUMN image_path TEXT")
        changed = True

    try:
        cols = conn.execute("PRAGMA table_info(orders)").fetchall()
        col_names = [col[1] for col in cols]
        if "accepted_at" not in col_names:
            conn.execute("ALTER TABLE orders ADD COLUMN accepted_at INTEGER")
            changed = True
        if "ready_at" not in col_names:
            conn.execute("ALTER TABLE orders ADD COLUMN ready_at INTEGER")
            changed = True
        if "paid_at" not in col_names:
            conn.execute("ALTER TABLE orders ADD COLUMN paid_at INTEGER")
            changed = True
    except sqlite3.OperationalError:
        # orders table may not exist during initial bootstrap
        pass

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bill_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL,
            items TEXT NOT NULL,
            total REAL NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )

    if changed:
        conn.commit()

def reset_table_sequence_if_empty(conn):
    row = conn.execute("SELECT COUNT(*) AS cnt FROM tables").fetchone()
    if row and row["cnt"] == 0:
        conn.execute("DELETE FROM sqlite_sequence WHERE name='tables'")

def get_db():
    conn = sqlite3.connect("database.db")
    conn.row_factory = sqlite3.Row
    ensure_schema(conn)
    return conn


def promote_ready_after_eta(db, now_ts):
    db.execute(
        """
        UPDATE orders
        SET status='ready', ready_at=?
        WHERE status='accepted'
          AND accepted_at IS NOT NULL
          AND CAST(time AS INTEGER) > 0
          AND accepted_at + (CAST(time AS INTEGER) * 60) <= ?
        """,
        (now_ts, now_ts),
    )


@app.route("/")
def home():
    # Cache-bust front-page images so replacing a file shows up immediately.
    return render_template("index.html", cache_bust=int(pytime.time()))


# OWNER PAGE
@app.route("/owner", methods=["GET","POST"])
def owner():
    db = get_db()

    if request.method == "POST":

        if "food" in request.form and "price" in request.form:
            food = request.form["food"].strip()
            price = request.form["price"].strip()
            food_type = request.form.get("food_type", "veg").strip().lower()
            if food_type not in ("veg", "non-veg"):
                food_type = "veg"

            if food and price:
                image_path = None
                f = request.files.get("food_image")
                if f and f.filename:
                    if is_allowed_image(f.filename):
                        upload_dir = ensure_upload_dir()
                        safe_name = secure_filename(f.filename)
                        unique_name = f"{int(pytime.time())}_{safe_name}"
                        full_path = os.path.join(upload_dir, unique_name)
                        f.save(full_path)
                        image_path = os.path.join(STATIC_UPLOAD_SUBDIR, unique_name).replace("\\", "/")
                db.execute(
                    "INSERT INTO menu (food,price,food_type,image_path) VALUES (?,?,?,?)",
                    (food, price, food_type, image_path),
                )
                db.commit()

        if "food_remove" in request.form:
            food_id = request.form["food_remove"].strip()
            if food_id:
                row = db.execute("SELECT image_path FROM menu WHERE id=?", (food_id,)).fetchone()
                if row and row["image_path"]:
                    candidate = os.path.normpath(os.path.join(app.root_path, "static", row["image_path"]))
                    static_root = os.path.normpath(os.path.join(app.root_path, "static"))
                    if candidate.startswith(static_root) and os.path.isfile(candidate):
                        try:
                            os.remove(candidate)
                        except OSError:
                            pass
                db.execute("DELETE FROM menu WHERE id=?",(food_id,))
                db.commit()

        if "table_add" in request.form:
            db.execute("INSERT INTO tables DEFAULT VALUES")
            db.commit()

        if "table_remove" in request.form:
            table_id = request.form["table_remove"]
            db.execute("DELETE FROM tables WHERE id=?",(table_id,))
            db.execute("DELETE FROM orders WHERE table_id=?",(table_id,))
            reset_table_sequence_if_empty(db)
            db.commit()

    menu = db.execute(
        """
        SELECT *
        FROM menu
        ORDER BY
          CASE LOWER(COALESCE(food_type, ''))
            WHEN 'veg' THEN 0
            WHEN 'non-veg' THEN 1
            WHEN 'non veg' THEN 1
            ELSE 2
          END,
          id ASC
        """
    ).fetchall()
    tables = db.execute("SELECT * FROM tables ORDER BY id ASC").fetchall()

    return render_template("owner.html",menu=menu,tables=tables)


# CUSTOMER PAGE
@app.route("/customer", methods=["GET","POST"])
def customer():
    db = get_db()

    if request.method == "POST":
        table = request.form.get("table", "").strip()
        foods = request.form.getlist("foods")
        qtys = request.form.getlist("qtys")
        added = False

        if table and foods and qtys:
            for food, qty_raw in zip(foods, qtys):
                food_name = (food or "").strip()
                try:
                    qty = int(qty_raw)
                except (TypeError, ValueError):
                    qty = 0

                if food_name and qty > 0:
                    for _ in range(qty):
                        db.execute(
                            "INSERT INTO orders (table_id,food,status) VALUES (?,?,?)",
                            (table,food_name,"waiting")
                        )
                    added = True
        else:
            # Backward compatibility for older single-item customer form.
            food = request.form.get("food", "").strip()
            if table and food:
                db.execute(
                    "INSERT INTO orders (table_id,food,status) VALUES (?,?,?)",
                    (table,food,"waiting")
                )
                added = True

        if added:
            db.commit()

    menu = db.execute(
        """
        SELECT *
        FROM menu
        ORDER BY
          CASE LOWER(COALESCE(food_type, ''))
            WHEN 'veg' THEN 0
            WHEN 'non-veg' THEN 1
            WHEN 'non veg' THEN 1
            ELSE 2
          END,
          id ASC
        """
    ).fetchall()
    tables = db.execute("SELECT * FROM tables ORDER BY id ASC").fetchall()

    return render_template("customer.html", menu=menu, tables=tables)


@app.route("/customer_status", methods=["GET"])
def customer_status():
    db = get_db()
    now_ts = int(pytime.time())

    promote_ready_after_eta(db, now_ts)
    db.commit()

    table_raw = (request.args.get("table") or "").strip()
    try:
        table_id = int(table_raw)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid table"}), 400

    rows = db.execute(
        """
        SELECT time, accepted_at
        FROM orders
        WHERE table_id=?
          AND status='accepted'
        ORDER BY id ASC
        """,
        (table_id,),
    ).fetchall()

    eta_max = None
    remaining_max = None
    accepted_count = 0

    for r in rows:
        accepted_count += 1
        try:
            eta_minutes = int((r["time"] or "0").strip())
        except (TypeError, ValueError):
            eta_minutes = 0

        if eta_minutes > 0:
            if eta_max is None or eta_minutes > eta_max:
                eta_max = eta_minutes

        accepted_at = r["accepted_at"]
        if accepted_at and eta_minutes > 0:
            remaining_seconds = (accepted_at + (eta_minutes * 60)) - now_ts
            remaining_minutes = max(0, int((remaining_seconds + 59) // 60))
        else:
            # Fallback for legacy rows: show the ETA as "remaining".
            remaining_minutes = max(0, eta_minutes)

        if remaining_max is None or remaining_minutes > remaining_max:
            remaining_max = remaining_minutes

    return jsonify(
        {
            "ok": True,
            "table_id": table_id,
            "accepted_count": accepted_count,
            "eta_max": eta_max,
            "remaining_max": remaining_max,
        }
    )


# CHEF PAGE
@app.route("/chef", methods=["GET","POST"])
def chef():
    db = get_db()
    now_ts = int(pytime.time())

    if request.method == "POST":
        table_raw = request.form.get("group_table", "").strip()
        food = request.form.get("group_food", "").strip()
        try:
            table_id = int(table_raw)
        except (TypeError, ValueError):
            table_id = None

        if table_id is not None and food:
            # mark ready button was pressed (for entire group)
            if "ready" in request.form:
                db.execute(
                    """
                    UPDATE orders
                    SET status='ready', ready_at=?
                    WHERE table_id=? AND food=? AND status='accepted'
                    """,
                    (now_ts, table_id, food),
                )
                db.commit()
            # reject button was pressed (for entire group)
            elif "reject" in request.form:
                db.execute(
                    """
                    UPDATE orders
                    SET status='rejected'
                    WHERE table_id=? AND food=? AND status='waiting'
                    """,
                    (table_id, food),
                )
                db.commit()
            else:
                # accept action (for entire group)
                eta_raw = request.form.get("time", "").strip()
                try:
                    eta_minutes = int(eta_raw)
                except (TypeError, ValueError):
                    eta_minutes = 0

                if eta_minutes > 0:
                    db.execute(
                        """
                        UPDATE orders
                        SET status='accepted', time=?, accepted_at=?
                        WHERE table_id=? AND food=? AND status='waiting'
                        """,
                        (str(eta_minutes), now_ts, table_id, food),
                    )
                    db.commit()

    # Auto-move accepted items to billing after ETA.
    promote_ready_after_eta(db, now_ts)
    db.commit()

    orders_raw = db.execute(
        """
        SELECT
          table_id,
          food,
          status,
          COUNT(*) AS qty,
          MIN(accepted_at) AS accepted_at,
          MAX(CAST(time AS INTEGER)) AS time
        FROM orders
        WHERE status IN ('waiting','accepted')
        GROUP BY table_id, food, status
        ORDER BY
          CASE status
            WHEN 'waiting' THEN 0
            WHEN 'accepted' THEN 1
            ELSE 2
          END,
          table_id ASC,
          food ASC
        """
    ).fetchall()

    orders = []
    for row in orders_raw:
        d = dict(row)
        if d.get("status") == "accepted" and d.get("accepted_at") is not None:
            try:
                eta_minutes = int(d.get("time") or 0)
            except (TypeError, ValueError):
                eta_minutes = 0
            if eta_minutes > 0:
                remaining = (d["accepted_at"] + (eta_minutes * 60)) - now_ts
                d["remaining_seconds"] = max(0, int(remaining))
        orders.append(d)

    return render_template("chef.html",orders=orders)


# BILLING PAGE
@app.route("/billing", methods=["GET", "POST"])
def billing():
    db = get_db()
    now_ts = int(pytime.time())

    promote_ready_after_eta(db, now_ts)
    db.commit()

    if request.method == "POST":
        table_raw = request.form.get("table_id", "").strip()
        try:
            table_id = int(table_raw)
        except (TypeError, ValueError):
            table_id = None

        if table_id is not None and request.form.get("bill_accept"):
            rows = db.execute(
                """
                SELECT o.food AS food,
                       COUNT(*) AS qty,
                       COALESCE(m.price, 0) AS price
                FROM orders o
                LEFT JOIN menu m ON o.food = m.food
                WHERE o.table_id=? AND o.status='ready'
                GROUP BY o.food
                ORDER BY o.food ASC
                """,
                (table_id,),
            ).fetchall()

            if rows:
                parts = []
                total = 0
                for r in rows:
                    qty = int(r["qty"] or 0)
                    price = float(r["price"] or 0)
                    parts.append(f"{qty}* {r['food']}")
                    total += qty * price

                db.execute(
                    "INSERT INTO bill_history (table_id, items, total, created_at) VALUES (?,?,?,?)",
                    (table_id, ", ".join(parts), total, now_ts),
                )
                db.execute(
                    """
                    UPDATE orders
                    SET status='paid', paid_at=?
                    WHERE table_id=? AND status='ready'
                    """,
                    (now_ts, table_id),
                )
                db.commit()

    table_rows = db.execute(
        """
        SELECT DISTINCT table_id
        FROM orders
        WHERE status='ready'
        ORDER BY table_id ASC
        """
    ).fetchall()

    bills = []
    for tr in table_rows:
        table_id = tr["table_id"]
        items = db.execute(
            """
            SELECT o.food AS food,
                   COUNT(*) AS qty,
                   COALESCE(m.price, 0) AS price
            FROM orders o
            LEFT JOIN menu m ON o.food = m.food
            WHERE o.table_id=? AND o.status='ready'
            GROUP BY o.food
            ORDER BY o.food ASC
            """,
            (table_id,),
        ).fetchall()

        total = 0
        item_list = []
        for r in items:
            qty = int(r["qty"] or 0)
            price = float(r["price"] or 0)
            line_total = qty * price
            total += line_total
            item_list.append(
                {"food": r["food"], "qty": qty, "price": price, "line_total": line_total}
            )

        bills.append({"table_id": table_id, "items": item_list, "total": total})

    return render_template("billing.html", bills=bills)


@app.route("/billing_history")
def billing_history():
    db = get_db()
    rows = db.execute(
        """
        SELECT id, table_id, items, total, created_at
        FROM bill_history
        ORDER BY id DESC
        """
    ).fetchall()
    grand_total = sum(float(r["total"] or 0) for r in rows)
    return render_template(
        "billing_history.html", rows=rows, grand_total=grand_total
    )


if __name__ == "__main__":
    app.run(debug=True)
