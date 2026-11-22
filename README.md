# Smart Dustbin Tracker – Intelligent Waste Monitoring and Management System

A full-stack cyber-physical smart waste management web application that monitors dustbin fill levels in real time, displays live telemetry and sensor metrics on an interactive geospatial map, triggers automated overflow alerts, provides multidimensional analytics, and leverages a Scikit-Learn Machine Learning predictive model to forecast exact overflow windows.

---

## 🌟 Key Features

1. **Real-Time Dustbin Status Monitoring**:
   - Continuous IoT telemetry simulation tracking fill percentage, volume (Liters), battery condition, and sensor health across metropolitan zones.
   - Dynamic threshold classification: **Normal (<50%)**, **Moderate (50-79%)**, and **Critical (≥80%)**.

2. **Interactive Spatial Map (Leaflet.js)**:
   - High-precision OpenStreetMap visualization with custom color-coded pins.
   - Pulsing radar rings for critical containers requiring immediate attention.
   - Interactive popups displaying real-time fill level, ML estimated time to full, and one-click "Empty Bin" action.

3. **Machine Learning-Based Fill Prediction (Scikit-Learn)**:
   - Pre-trained `RandomForestRegressor` model ($R^2 = 0.9737$, $\text{MAE} = 1.068\text{ hrs}$).
   - Predicts hours remaining until 100% full capacity based on current fill %, baseline hourly fill rate, diurnal hour of day, day of week, and zone traffic density.
   - Integrated AI Predictor modal for on-the-fly scenario testing and automated dispatch recommendations.

4. **Automated Alert & Notification System**:
   - Urgent alert banner automatically appears when any container crosses 80%.
   - Instant visual toast notifications for collection events, fill spikes, and truck dispatches.

5. **Advanced Data Visualizations (Chart.js)**:
   - **24-Hour Diurnal Waste Curves**: Compares accumulation dynamics across Commercial, Residential, and Transit Hubs.
   - **Fill Status Doughnut Chart**: Real-time ratio of Safe vs. Moderate vs. Critical containers.
   - **Waste Stream Composition**: Breakdown of Organic, Recyclable, Hazardous, and General waste streams.
   - **Weekly Collection Tonnages**: 7-day historical volume tracking and SLA compliance.

6. **Full Administrative CRUD Management**:
   - Add new dustbins with custom GPS coordinates, capacity limits, and waste stream tags.
   - Edit existing bin parameters.
   - Delete retired dustbins.
   - One-click **"Dispatch Clearance Route"** to clear all critical bins simultaneously with logged waste tonnages.

7. **Area Photographic Inspection & Citizen Grievances**:
   - High-definition urban area photos integrated into each dustbin card, table view, and Leaflet map popup.
   - Dedicated Citizen Grievance Portal to report waste overflows, foul odors, or broken sensors with instant ticket generation (`TICKET-8xx`) and one-click dispatch resolution.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.10+, Flask, Flask-CORS, RESTful Architecture |
| **Machine Learning** | Scikit-Learn (`RandomForestRegressor`), NumPy, Pandas, Joblib |
| **Frontend** | HTML5, CSS3 (Modern Glassmorphism & Responsive Grid), Vanilla JavaScript (ES6+) |
| **Data Visualization** | Chart.js |
| **Mapping Engine** | Leaflet.js, OpenStreetMap |
| **Data Storage** | Structured JSON Data Store (`data.json`) |

---

## 📁 Project Directory Structure

```text
Smart-Dustbin-Tracker/
│
├── backend/
│   ├── app.py               # Flask REST backend & web server
│   ├── data.json            # Central database store for bins & logs
│   ├── model.pkl            # Pre-trained Scikit-Learn ML regression model
│   ├── train_model.py       # ML dataset generator & model training pipeline
│   └── requirements.txt     # Python dependency specifications
│
├── frontend/
│   ├── index.html           # Project overview, hero banner & quick metrics
│   ├── dashboard.html       # Operations command center with Leaflet map
│   ├── status.html          # Individual bin telemetry cards & registry table
│   ├── visualization.html   # Chart.js multidimensional analytical reports
│   │
│   ├── css/
│   │   └── style.css        # Responsive dual-theme (Dark/Light) glassmorphic styles
│   │
│   └── js/
│       └── script.js        # Leaflet, Chart.js, ML predictor, theme toggle & CRUD
│
├── PROJECT_REPORT.md        # Comprehensive technical & academic project report
└── README.md                # Project documentation & quick start guide
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
Ensure **Python 3.8+** is installed on your computer.

### 2. Install Dependencies
Open a terminal in the project directory and install the requirements:
```bash
pip install -r backend/requirements.txt
```

### 3. (Optional) Re-Train the ML Model
The pre-trained model `model.pkl` is already included. If you wish to retrain it:
```bash
python backend/train_model.py
```
*Output: `Model Training Completed: MAE: 1.068 hours, R2 Score: 0.9737`*

### 4. Run the Application
Start the Flask application:
```bash
python backend/app.py
```

### 5. Open in Web Browser
Open your favorite browser and visit:
```text
http://127.0.0.1:5000
```
Navigate between the pages using the navigation bar:
- **Home**: `http://127.0.0.1:5000/`
- **Dashboard**: `http://127.0.0.1:5000/dashboard`
- **Dustbin Status**: `http://127.0.0.1:5000/status`
- **Data Visualization**: `http://127.0.0.1:5000/visualization`
- **About & Documentation**: `http://127.0.0.1:5000/about`

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check and ML model status |
| `/api/dustbins` | `GET` | Returns all dustbins enriched with live telemetry & ML predictions |
| `/api/dustbins/<id>` | `GET` | Retrieve single dustbin details |
| `/api/dustbins` | `POST` | Create a new dustbin (CRUD) |
| `/api/dustbins/<id>` | `PUT` | Update dustbin details (CRUD) |
| `/api/dustbins/<id>` | `DELETE` | Remove a dustbin node (CRUD) |
| `/api/dustbins/<id>/empty` | `POST` | Empty a dustbin (sets fill to 2-5% and records collection log) |
| `/api/dustbins/<id>/simulate` | `POST` | Simulate a sensor reading increment (+5% to +15%) |
| `/api/dustbins/simulate-all` | `POST` | Simulate citywide waste accumulation |
| `/api/dispatch-collector` | `POST` | Clear all critical bins (≥80%) and log truck route event |
| `/api/predict` | `POST` | Run ML model on arbitrary parameters (`current_fill`, `base_fill_rate`, `hour`, `day`, `zone`) |
| `/api/complaints` | `GET` | Retrieve all citizen grievance tickets with area photographs |
| `/api/complaints` | `POST` | Register a new waste problem complaint (returns ticket number) |
| `/api/complaints/<id>/resolve` | `PUT` | Mark a complaint as resolved and notify sanitation crew |
| `/api/analytics` | `GET` | Consolidated KPIs, trends, categories, and active alerts |
| `/api/collection-logs` | `GET` | Historical truck dispatch and waste clearance records |

---

## 🧠 Machine Learning Methodology

The prediction engine models waste accumulation as a function of multiple spatial and temporal features:

$$\text{Hours Until Full} = f\Big(C_{\text{current}},\, r_{\text{base}},\, H_{\text{day}},\, D_{\text{week}},\, Z_{\text{activity}}\Big)$$

- **Algorithm**: `RandomForestRegressor(n_estimators=100, max_depth=14, random_state=42)`
- **Mean Absolute Error (MAE)**: 1.068 hours
- **Coefficient of Determination ($R^2$)**: 0.9737 (97.4% variance explained)
- **Feature Set**:
  - `current_fill`: Container volume occupied (0% - 99%)
  - `base_fill_rate`: Baseline accumulation speed (%/hour)
  - `hour_of_day`: Diurnal hour (0 - 23), capturing meal-time surges
  - `day_of_week`: Weekday vs. weekend foot traffic dynamics (0 - 6)
  - `zone_activity`: Multiplier (1 = Residential, 2 = Institutional, 3 = Commercial, 4 = High-density Transit)

---

## 📄 License
This project is open-source under the MIT License.

