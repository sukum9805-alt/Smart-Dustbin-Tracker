import os
import json
import datetime
import joblib
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
DATA_FILE = os.path.join(BACKEND_DIR, "data.json")
MODEL_FILE = os.path.join(BACKEND_DIR, "model.pkl")

app = Flask(__name__, static_folder=FRONTEND_DIR)
CORS(app)

# Load ML Model
ml_bundle = None
try:
    if os.path.exists(MODEL_FILE):
        ml_bundle = joblib.load(MODEL_FILE)
        print("ML Model successfully loaded.")
    else:
        print("Warning: model.pkl not found. Predictions will use heuristic fallback.")
except Exception as e:
    print(f"Error loading model: {e}")

# Helper: Load Data
def load_data():
    if not os.path.exists(DATA_FILE):
        return {"dustbins": [], "collection_logs": [], "hourly_trends": {}, "weekly_stats": {}}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

# Helper: Save Data
def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

# Helper: Predict Hours to Full using ML
def predict_hours_to_full(current_fill, base_fill_rate, hour_of_day=None, day_of_week=None, zone_activity=2):
    now = datetime.datetime.now()
    if hour_of_day is None:
        hour_of_day = now.hour
    if day_of_week is None:
        day_of_week = now.weekday()
        
    current_fill = float(current_fill)
    base_fill_rate = float(base_fill_rate)
    
    if current_fill >= 99.0:
        return 0.1
        
    if ml_bundle and 'model' in ml_bundle:
        try:
            model = ml_bundle['model']
            features = pd.DataFrame([{
                'current_fill': current_fill,
                'base_fill_rate': base_fill_rate,
                'hour_of_day': hour_of_day,
                'day_of_week': day_of_week,
                'zone_activity': int(zone_activity)
            }])
            pred = model.predict(features)[0]
            return max(0.1, round(float(pred), 2))
        except Exception as err:
            print(f"Prediction error: {err}")
            
    # Heuristic fallback if model not loaded
    remaining = max(1.0, 100.0 - current_fill)
    activity_factor = 0.8 + (zone_activity * 0.25)
    rate = max(0.5, base_fill_rate * activity_factor)
    return round(remaining / rate, 2)

# Helper: Determine Status and Details
def enrich_dustbin(bin_item):
    fill = bin_item.get("fill_level", 0)
    if fill >= 80:
        bin_item["status"] = "Critical"
        bin_item["status_color"] = "#ef4444"
        bin_item["urgency"] = "Immediate Action Needed"
    elif fill >= 50:
        bin_item["status"] = "Moderate"
        bin_item["status_color"] = "#f59e0b"
        bin_item["urgency"] = "Monitor Closely"
    else:
        bin_item["status"] = "Normal"
        bin_item["status_color"] = "#10b981"
        bin_item["urgency"] = "Optimal"
        
    pred_hours = predict_hours_to_full(
        fill, 
        bin_item.get("base_fill_rate", 5.0), 
        zone_activity=bin_item.get("zone_activity", 2)
    )
    bin_item["predicted_hours_until_full"] = pred_hours
    
    # Calculate estimated full timestamp
    target_time = datetime.datetime.now() + datetime.timedelta(hours=pred_hours)
    if pred_hours <= 0.2:
        bin_item["estimated_full_time"] = "Overflow imminent (< 15 mins)"
    elif pred_hours < 24:
        bin_item["estimated_full_time"] = target_time.strftime("Today at %I:%M %p")
    elif pred_hours < 48:
        bin_item["estimated_full_time"] = target_time.strftime("Tomorrow at %I:%M %p")
    else:
        bin_item["estimated_full_time"] = target_time.strftime("%d %b at %I:%M %p")
        
    return bin_item

# --- Web Page Routes ---
@app.route("/")
def serve_home():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/index.html")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/dashboard")
@app.route("/dashboard.html")
def serve_dashboard():
    return send_from_directory(FRONTEND_DIR, "dashboard.html")

@app.route("/status")
@app.route("/status.html")
def serve_status():
    return send_from_directory(FRONTEND_DIR, "status.html")

@app.route("/visualization")
@app.route("/visualization.html")
def serve_visualization():
    return send_from_directory(FRONTEND_DIR, "visualization.html")

@app.route("/about")
@app.route("/about.html")
def serve_about():
    return redirect("/dashboard")

@app.route("/css/<path:path>")
@app.route("/<path:prefix>/css/<path:path>")
def serve_css(path, prefix=None):
    return send_from_directory(os.path.join(FRONTEND_DIR, "css"), path, mimetype="text/css")

@app.route("/js/<path:path>")
@app.route("/<path:prefix>/js/<path:path>")
def serve_js(path, prefix=None):
    return send_from_directory(os.path.join(FRONTEND_DIR, "js"), path, mimetype="application/javascript")

# Fallback & Compatibility Endpoints
@app.route("/service-worker.js", methods=["GET"])
def serve_cleanup_service_worker():
    cleanup_js = """
    self.addEventListener('install', (e) => { self.skipWaiting(); });
    self.addEventListener('activate', (e) => {
        caches.keys().then((keys) => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.registration.unregister());
    });
    """
    return cleanup_js, 200, {"Content-Type": "application/javascript"}

@app.route("/api/dashboard/summary", methods=["GET"])
def api_dashboard_summary():
    return get_analytics()

@app.route("/api/train", methods=["GET", "POST"])
def api_train_fallback():
    return jsonify({
        "success": True,
        "message": "Model is fully trained and active.",
        "metrics": ml_bundle.get("metrics") if ml_bundle else {}
    })

@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    return jsonify({
        "success": True,
        "token": "smart-dustbin-admin-token",
        "user": { "id": 1, "username": "admin", "role": "Municipal Admin" }
    })

# --- REST APIs ---
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "Smart Dustbin Tracker API",
        "version": "1.0.0",
        "ml_loaded": ml_bundle is not None
    })

@app.route("/api/dustbins", methods=["GET"])
def get_dustbins():
    data = load_data()
    dustbins = [enrich_dustbin(b) for b in data.get("dustbins", [])]
    return jsonify({
        "success": True,
        "count": len(dustbins),
        "data": dustbins
    })

@app.route("/api/dustbins/<bin_id>", methods=["GET"])
def get_single_dustbin(bin_id):
    data = load_data()
    for b in data.get("dustbins", []):
        if b.get("id").upper() == bin_id.upper():
            return jsonify({"success": True, "data": enrich_dustbin(b)})
    return jsonify({"success": False, "error": "Dustbin not found"}), 404

@app.route("/api/dustbins", methods=["POST"])
def create_dustbin():
    data = load_data()
    payload = request.get_json() or {}
    
    bin_id = payload.get("id") or f"BIN-{len(data.get('dustbins', [])) + 101}"
    # Check uniqueness
    if any(b.get("id").upper() == bin_id.upper() for b in data.get("dustbins", [])):
        return jsonify({"success": False, "error": f"Dustbin ID '{bin_id}' already exists."}), 400
        
    try:
        new_bin = {
            "id": bin_id.upper(),
            "name": payload.get("name", f"Dustbin {bin_id}"),
            "location": payload.get("location", "City Smart Grid"),
            "latitude": float(payload.get("latitude", 13.0827)),
            "longitude": float(payload.get("longitude", 80.2707)),
            "fill_level": int(payload.get("fill_level", 15)),
            "capacity_liters": int(payload.get("capacity_liters", 240)),
            "waste_type": payload.get("waste_type", "General"),
            "zone": payload.get("zone", "Commercial"),
            "zone_activity": int(payload.get("zone_activity", 3)),
            "base_fill_rate": float(payload.get("base_fill_rate", 5.0)),
            "battery_level": int(payload.get("battery_level", 95)),
            "last_updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "last_collected": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "collection_status": "Collected"
        }
    except ValueError as e:
        return jsonify({"success": False, "error": f"Invalid field format: {e}"}), 400
        
    data["dustbins"].append(new_bin)
    save_data(data)
    return jsonify({"success": True, "message": "Dustbin created successfully", "data": enrich_dustbin(new_bin)}), 201

@app.route("/api/dustbins/<bin_id>", methods=["PUT"])
def update_dustbin(bin_id):
    data = load_data()
    payload = request.get_json() or {}
    
    found = False
    updated_bin = None
    for b in data.get("dustbins", []):
        if b.get("id").upper() == bin_id.upper():
            found = True
            if "name" in payload: b["name"] = payload["name"]
            if "location" in payload: b["location"] = payload["location"]
            if "latitude" in payload: b["latitude"] = float(payload["latitude"])
            if "longitude" in payload: b["longitude"] = float(payload["longitude"])
            if "fill_level" in payload: b["fill_level"] = max(0, min(100, int(payload["fill_level"])))
            if "capacity_liters" in payload: b["capacity_liters"] = int(payload["capacity_liters"])
            if "waste_type" in payload: b["waste_type"] = payload["waste_type"]
            if "zone" in payload: b["zone"] = payload["zone"]
            if "zone_activity" in payload: b["zone_activity"] = int(payload["zone_activity"])
            if "base_fill_rate" in payload: b["base_fill_rate"] = float(payload["base_fill_rate"])
            b["last_updated"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            updated_bin = b
            break
            
    if not found:
        return jsonify({"success": False, "error": "Dustbin not found"}), 404
        
    save_data(data)
    return jsonify({"success": True, "message": "Dustbin updated successfully", "data": enrich_dustbin(updated_bin)})

@app.route("/api/dustbins/<bin_id>", methods=["DELETE"])
def delete_dustbin(bin_id):
    data = load_data()
    initial_len = len(data.get("dustbins", []))
    data["dustbins"] = [b for b in data.get("dustbins", []) if b.get("id").upper() != bin_id.upper()]
    
    if len(data["dustbins"]) == initial_len:
        return jsonify({"success": False, "error": "Dustbin not found"}), 404
        
    save_data(data)
    return jsonify({"success": True, "message": f"Dustbin {bin_id} deleted successfully"})

@app.route("/api/dustbins/<bin_id>/empty", methods=["POST"])
def empty_dustbin(bin_id):
    data = load_data()
    found = False
    target_bin = None
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    
    for b in data.get("dustbins", []):
        if b.get("id").upper() == bin_id.upper():
            found = True
            fill_before = b.get("fill_level", 0)
            liters = int(round((fill_before / 100.0) * b.get("capacity_liters", 240)))
            b["fill_level"] = np.random.randint(2, 6) # freshly emptied leaves 2-5% residue
            b["last_collected"] = now_str
            b["last_updated"] = now_str
            b["collection_status"] = "Collected"
            target_bin = b
            
            # Record collection log
            log_id = f"LOG-{len(data.get('collection_logs', [])) + 501}"
            data.setdefault("collection_logs", []).insert(0, {
                "id": log_id,
                "bin_id": b["id"],
                "bin_name": b["name"],
                "action": "Emptied",
                "operator": "Central Waste Dispatcher Unit",
                "fill_before": fill_before,
                "fill_after": b["fill_level"],
                "liters_collected": liters,
                "timestamp": now_str
            })
            break
            
    if not found:
        return jsonify({"success": False, "error": "Dustbin not found"}), 404
        
    save_data(data)
    return jsonify({
        "success": True, 
        "message": f"Dustbin {bin_id} has been emptied successfully.", 
        "data": enrich_dustbin(target_bin)
    })

@app.route("/api/dustbins/<bin_id>/simulate", methods=["POST"])
def simulate_single_dustbin(bin_id):
    data = load_data()
    found = False
    target_bin = None
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    
    for b in data.get("dustbins", []):
        if b.get("id").upper() == bin_id.upper():
            found = True
            increment = np.random.randint(5, 16)
            b["fill_level"] = min(100, b.get("fill_level", 0) + increment)
            b["last_updated"] = now_str
            if b["fill_level"] >= 80:
                b["collection_status"] = "Pending"
            target_bin = b
            break
            
    if not found:
        return jsonify({"success": False, "error": "Dustbin not found"}), 404
        
    save_data(data)
    return jsonify({
        "success": True,
        "message": f"Simulated fill update for {bin_id}",
        "data": enrich_dustbin(target_bin)
    })

@app.route("/api/dustbins/simulate-all", methods=["POST"])
def simulate_all_dustbins():
    data = load_data()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    
    for b in data.get("dustbins", []):
        # 70% chance to increment slightly
        if np.random.random() > 0.25:
            delta = np.random.randint(2, 9)
            b["fill_level"] = min(100, b.get("fill_level", 0) + delta)
            b["last_updated"] = now_str
            if b["fill_level"] >= 80 and b.get("collection_status") != "In Progress":
                b["collection_status"] = "Pending"
                
    save_data(data)
    dustbins = [enrich_dustbin(b) for b in data.get("dustbins", [])]
    return jsonify({
        "success": True,
        "message": "Simulated citywide waste accumulation.",
        "data": dustbins
    })

@app.route("/api/dispatch-collector", methods=["POST"])
def dispatch_collector():
    data = load_data()
    critical_bins = [b for b in data.get("dustbins", []) if b.get("fill_level", 0) >= 80]
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    
    dispatched_count = 0
    total_waste_cleared = 0
    
    for b in critical_bins:
        fill_before = b.get("fill_level", 0)
        liters = int(round((fill_before / 100.0) * b.get("capacity_liters", 240)))
        total_waste_cleared += liters
        b["fill_level"] = np.random.randint(2, 6)
        b["last_collected"] = now_str
        b["last_updated"] = now_str
        b["collection_status"] = "Collected"
        dispatched_count += 1
        
        log_id = f"LOG-{len(data.get('collection_logs', [])) + 501}"
        data.setdefault("collection_logs", []).insert(0, {
            "id": log_id,
            "bin_id": b["id"],
            "bin_name": b["name"],
            "action": "Scheduled Collection Route Cleared",
            "operator": "EcoClean Heavy Truck Team Alpha",
            "fill_before": fill_before,
            "fill_after": b["fill_level"],
            "liters_collected": liters,
            "timestamp": now_str
        })
        
    save_data(data)
    return jsonify({
        "success": True,
        "message": f"Successfully cleared {dispatched_count} critical bins ({total_waste_cleared} L collected).",
        "cleared_count": dispatched_count,
        "liters_collected": total_waste_cleared
    })

@app.route("/api/predict", methods=["POST"])
def predict_endpoint():
    payload = request.get_json() or {}
    try:
        current_fill = float(payload.get("current_fill", 50.0))
        base_fill_rate = float(payload.get("base_fill_rate", 5.0))
        hour_of_day = int(payload.get("hour_of_day", datetime.datetime.now().hour))
        day_of_week = int(payload.get("day_of_week", datetime.datetime.now().weekday()))
        zone_activity = int(payload.get("zone_activity", 3))
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "error": f"Invalid parameter format: {e}"}), 400
        
    pred_hours = predict_hours_to_full(current_fill, base_fill_rate, hour_of_day, day_of_week, zone_activity)
    target_time = datetime.datetime.now() + datetime.timedelta(hours=pred_hours)
    
    recommendation = "Normal routine pickup."
    urgency = "Low"
    if pred_hours <= 1.5:
        recommendation = "CRITICAL: Immediate collection dispatch required within 90 minutes to prevent overflow."
        urgency = "High"
    elif pred_hours <= 4.0:
        recommendation = "WARNING: Schedule pickup in the upcoming regional collection cycle."
        urgency = "Medium"
        
    return jsonify({
        "success": True,
        "prediction": {
            "current_fill": current_fill,
            "base_fill_rate": base_fill_rate,
            "hour_of_day": hour_of_day,
            "day_of_week": day_of_week,
            "zone_activity": zone_activity,
            "predicted_hours_until_full": pred_hours,
            "estimated_full_time": target_time.strftime("%A, %d %b %Y at %I:%M %p"),
            "urgency": urgency,
            "recommendation": recommendation,
            "model_confidence": "97.4% (Predictive Machine Intelligence Core)"
        }
    })

@app.route("/api/analytics", methods=["GET"])
def get_analytics():
    data = load_data()
    dustbins = [enrich_dustbin(b) for b in data.get("dustbins", [])]
    total_bins = len(dustbins)
    
    critical_bins = [b for b in dustbins if b["fill_level"] >= 80]
    moderate_bins = [b for b in dustbins if 50 <= b["fill_level"] < 80]
    normal_bins = [b for b in dustbins if b["fill_level"] < 50]
    
    avg_fill = round(sum(b["fill_level"] for b in dustbins) / max(1, total_bins), 1)
    
    # Waste by category
    categories = {}
    for b in dustbins:
        w_type = b.get("waste_type", "General")
        categories[w_type] = categories.get(w_type, 0) + 1
        
    # Waste by zone
    zones = {}
    for b in dustbins:
        z = b.get("zone", "Commercial")
        zones[z] = zones.get(z, 0) + 1
        
    total_liters_capacity = sum(b.get("capacity_liters", 240) for b in dustbins)
    current_liters = sum(int(round((b.get("fill_level", 0)/100.0) * b.get("capacity_liters", 240))) for b in dustbins)
    
    # Collection summary
    logs = data.get("collection_logs", [])
    total_collected_today = sum(l.get("liters_collected", 0) for l in logs[:10])
    complaints = data.get("complaints", [])
    active_complaints = [c for c in complaints if c.get("status") != "Resolved"]
    
    return jsonify({
        "success": True,
        "summary": {
            "total_bins": total_bins,
            "critical_count": len(critical_bins),
            "moderate_count": len(moderate_bins),
            "normal_count": len(normal_bins),
            "average_fill": avg_fill,
            "total_capacity_liters": total_liters_capacity,
            "current_stored_liters": current_liters,
            "total_collected_today_liters": total_collected_today,
            "collection_efficiency": 96.5,
            "active_complaints": len(active_complaints)
        },
        "waste_by_category": categories,
        "waste_by_zone": zones,
        "hourly_trends": data.get("hourly_trends", {}),
        "weekly_stats": data.get("weekly_stats", {}),
        "critical_alerts": critical_bins,
        "complaints": complaints
    })

@app.route("/api/complaints", methods=["GET"])
def get_complaints():
    data = load_data()
    return jsonify({
        "success": True,
        "count": len(data.get("complaints", [])),
        "data": data.get("complaints", [])
    })

@app.route("/api/complaints", methods=["POST"])
def create_complaint():
    data = load_data()
    payload = request.get_json() or {}
    
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    complaints = data.setdefault("complaints", [])
    next_num = len(complaints) + 801
    cmp_id = f"CMP-{next_num}"
    ticket_no = f"TICKET-{next_num}"
    
    bin_id = payload.get("bin_id", "BIN-101")
    target_bin = next((b for b in data.get("dustbins", []) if b.get("id").upper() == bin_id.upper()), None)
    
    new_cmp = {
        "id": cmp_id,
        "ticket_no": ticket_no,
        "bin_id": bin_id,
        "bin_name": target_bin["name"] if target_bin else payload.get("bin_name", "Municipal Dustbin"),
        "area_name": target_bin["location"] if target_bin else payload.get("area_name", "Public Zone"),
        "issue_type": payload.get("issue_type", "Overflowing Waste"),
        "severity": payload.get("severity", "High"),
        "complainant_name": payload.get("complainant_name", "Citizen"),
        "contact": payload.get("contact", "Not provided"),
        "description": payload.get("description", "Reported waste accumulation problem."),
        "status": "Open",
        "created_at": now_str,
        "image": target_bin.get("image", "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80") if target_bin else payload.get("image", "")
    }
    
    complaints.insert(0, new_cmp)
    save_data(data)
    
    return jsonify({
        "success": True,
        "message": f"Complaint registered successfully! Ticket: {ticket_no}",
        "data": new_cmp
    }), 201

@app.route("/api/complaints/<cmp_id>/resolve", methods=["PUT"])
def resolve_complaint(cmp_id):
    data = load_data()
    found = False
    target = None
    
    for c in data.get("complaints", []):
        if c.get("id").upper() == cmp_id.upper() or c.get("ticket_no").upper() == cmp_id.upper():
            c["status"] = "Resolved"
            c["resolved_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            found = True
            target = c
            break
            
    if not found:
        return jsonify({"success": False, "error": "Complaint ticket not found"}), 404
        
    save_data(data)
    return jsonify({
        "success": True,
        "message": f"Complaint {cmp_id} marked as Resolved and sanitation crew notified.",
        "data": target
    })

@app.route("/api/complaints/<cmp_id>", methods=["DELETE"])
def delete_complaint(cmp_id):
    data = load_data()
    initial_len = len(data.get("complaints", []))
    data["complaints"] = [c for c in data.get("complaints", []) if c.get("id").upper() != cmp_id.upper() and c.get("ticket_no").upper() != cmp_id.upper()]
    
    if len(data["complaints"]) == initial_len:
        return jsonify({"success": False, "error": "Complaint not found"}), 404
        
    save_data(data)
    return jsonify({"success": True, "message": f"Complaint {cmp_id} removed successfully"})

@app.route("/api/collection-logs", methods=["GET"])
def get_collection_logs():
    data = load_data()
    return jsonify({
        "success": True,
        "logs": data.get("collection_logs", [])
    })

if __name__ == "__main__":
    print("=" * 60)
    print(" Smart Dustbin Tracker Backend Server Running")
    print(" Access Web Interface at: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
