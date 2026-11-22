/**
 * Smart Dustbin Tracker – Intelligent Waste Management System
 * Unified Frontend Logic (Geospatial Satellite Grid Map, Dynamic Telemetric Analytics, ML Predictor, CRUD, Live Sensors)
 */

// Unregister any stale service workers or caches from prior projects on port 5000
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (let reg of registrations) {
      reg.unregister();
    }
  });
}
if ('caches' in window) {
  caches.keys().then(keys => {
    keys.forEach(k => caches.delete(k));
  });
}

// --- Theme Management (Dark / Light Mode) ---
function initTheme() {
  const savedTheme = localStorage.getItem('smart_dustbin_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButtonUI(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const nextTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('smart_dustbin_theme', nextTheme);
  updateThemeButtonUI(nextTheme);
  showToast(`Switched to ${nextTheme === 'dark' ? 'Dark Mode 🌙' : 'Light Mode ☀️'}`, 'info');
  if (state.map) {
    setTimeout(() => state.map.invalidateSize(), 150);
  }
}

function updateThemeButtonUI(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  if (theme === 'light') {
    btn.innerHTML = '<i class="fas fa-moon" style="color:#6366f1;"></i> <span>Dark</span>';
    btn.title = 'Switch to Dark Mode';
  } else {
    btn.innerHTML = '<i class="fas fa-sun" style="color:#f59e0b;"></i> <span>Light</span>';
    btn.title = 'Switch to Light Mode';
  }
}

// Immediately apply theme before DOMContentLoaded to prevent flicker
initTheme();

// Determine API base url (handles both Telemetry Server served and standalone file opening)
const API_BASE = window.location.origin.includes('http') ? window.location.origin : 'http://127.0.0.1:5000';

// Global application state
const state = {
  dustbins: [],
  complaints: [],
  analytics: null,
  map: null,
  markers: {},
  charts: {},
  liveSyncEnabled: true,
  syncInterval: null,
  searchQuery: '',
  filterStatus: 'all',
  filterType: 'all'
};

// --- Generic API Fetcher ---
async function apiCall(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    showToast(`Network error communicating with server at ${API_BASE}`, 'danger');
    return null;
  }
}

// --- Toast Notification System ---
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconClass = type === 'success' ? 'fa-check-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' :
                    type === 'danger'  ? 'fa-radiation' : 'fa-info-circle';

  toast.innerHTML = `
    <i class="fas ${iconClass} toast-icon"></i>
    <div class="toast-message">${message}</div>
    <button style="background:none;border:none;cursor:pointer;color:#94a3b8;" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4500);
}

// --- App Initialization on DOM Ready ---
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupNavbarActive();
  setupLiveSyncToggle();
  
  // Initialize map container immediately so UI and tiles render without delay
  if (document.getElementById('dustbin-map')) {
    initMap();
  }

  // Initial fetch
  await loadInitialData();

  // Populate map markers once data is available
  if (state.map) {
    updateMapMarkers();
  }

  // If charts are present
  if (document.getElementById('trendsChart') || document.getElementById('statusChart')) {
    initCharts();
  }

  // If dustbin grid / table is present
  if (document.getElementById('dustbin-grid') || document.getElementById('dustbin-table-body')) {
    renderDustbins();
  }

  // Setup search and filters if present
  setupFilterControls();

  // Start live polling
  startLiveSync();
});

// Highlight current page in navbar
function setupNavbarActive() {
  const path = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-item a');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (path.endsWith(href) || (href === '/' && (path === '/' || path.endsWith('index.html')))) {
      link.classList.add('active');
    }
  });
}

// --- Data Fetching & Syncing ---
async function loadInitialData() {
  const [binsRes, analyticsRes, complaintsRes] = await Promise.all([
    apiCall('/api/dustbins'),
    apiCall('/api/analytics'),
    apiCall('/api/complaints')
  ]);

  if (binsRes && binsRes.success) {
    state.dustbins = binsRes.data;
  }
  if (complaintsRes && complaintsRes.success) {
    state.complaints = complaintsRes.data;
    renderComplaints();
  }
  if (analyticsRes && analyticsRes.success) {
    state.analytics = analyticsRes;
    updateKPIWidgets(analyticsRes.summary);
    updateCriticalAlertBanner(analyticsRes.critical_alerts);
  }
}

function startLiveSync() {
  if (state.syncInterval) clearInterval(state.syncInterval);
  state.syncInterval = setInterval(async () => {
    if (!state.liveSyncEnabled) return;
    
    const [binsRes, analyticsRes, complaintsRes] = await Promise.all([
      apiCall('/api/dustbins'),
      apiCall('/api/analytics'),
      apiCall('/api/complaints')
    ]);

    if (binsRes && binsRes.success) {
      state.dustbins = binsRes.data;
      updateMapMarkers();
      renderDustbins();
    }
    if (complaintsRes && complaintsRes.success) {
      state.complaints = complaintsRes.data;
      renderComplaints();
    }
    if (analyticsRes && analyticsRes.success) {
      state.analytics = analyticsRes;
      updateKPIWidgets(analyticsRes.summary);
      updateCriticalAlertBanner(analyticsRes.critical_alerts);
      updateChartData();
    }
  }, 6000);
}

function setupLiveSyncToggle() {
  const syncBtn = document.getElementById('toggle-live-sync-btn');
  if (!syncBtn) return;
  syncBtn.addEventListener('click', () => {
    state.liveSyncEnabled = !state.liveSyncEnabled;
    if (state.liveSyncEnabled) {
      syncBtn.innerHTML = '<i class="fas fa-play"></i> Live Sync: ON';
      syncBtn.className = 'btn btn-sm btn-primary';
      showToast('Live real-time sensor sync activated (every 6s)', 'success');
    } else {
      syncBtn.innerHTML = '<i class="fas fa-pause"></i> Live Sync: PAUSED';
      syncBtn.className = 'btn btn-sm btn-outline';
      showToast('Live real-time sensor sync paused', 'warning');
    }
  });
}

// --- KPI Update ---
function updateKPIWidgets(summary) {
  if (!summary) return;
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('kpi-total-bins', summary.total_bins);
  setEl('kpi-critical-bins', summary.critical_count);
  setEl('kpi-moderate-bins', summary.moderate_count);
  setEl('kpi-normal-bins', summary.normal_count);
  setEl('kpi-avg-fill', `${summary.average_fill}%`);
  setEl('kpi-waste-today', `${summary.total_collected_today_liters} L`);
  setEl('kpi-efficiency', `${summary.collection_efficiency}%`);
}

function updateCriticalAlertBanner(criticalList) {
  const banner = document.getElementById('critical-alert-banner');
  if (!banner) return;

  if (!criticalList || criticalList.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  const binNames = criticalList.map(b => `${b.id} (${b.fill_level}%)`).join(', ');
  const textEl = document.getElementById('critical-alert-text');
  if (textEl) {
    textEl.innerHTML = `<strong>${criticalList.length} Dustbins</strong> currently need urgent collection: ${binNames}`;
  }
}

// --- Spatial Telemetry Interactive Map ---
function initMap() {
  const mapElement = document.getElementById('dustbin-map');
  if (!mapElement) return;

  if (typeof L === 'undefined') {
    console.warn('Leaflet library loading... retrying in 200ms');
    setTimeout(initMap, 200);
    return;
  }

  if (state.map) {
    try {
      state.map.remove();
    } catch(e) {}
    state.map = null;
  }

  try {
    // Center around city grid (13.0830, 80.2740)
    state.map = L.map('dustbin-map', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([13.0830, 80.2740], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    // Multiple invalidateSize ticks to ensure canvas renders properly
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 100);
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 350);
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 900);

    window.addEventListener('resize', () => {
      if (state.map) state.map.invalidateSize();
    });

    if (state.dustbins && state.dustbins.length > 0) {
      updateMapMarkers();
    }
  } catch (err) {
    console.error('Error initializing map:', err);
  }
}

function updateMapMarkers() {
  if (!state.map || typeof L === 'undefined') return;

  state.dustbins.forEach(bin => {
    const { id, name, location, latitude, longitude, fill_level, status, predicted_hours_until_full, waste_type, image } = bin;
    const areaImg = image || 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80';

    const pinClass = status === 'Critical' ? 'pin-red' : (status === 'Moderate' ? 'pin-yellow' : 'pin-green');
    const customIcon = L.divIcon({
      className: 'custom-pin-marker-div',
      html: `<div class="custom-pin ${pinClass}">${fill_level}%</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -18]
    });

    const popupHtml = `
      <div style="min-width: 220px; font-family: var(--font-main);">
        <div style="width:100%; height:95px; border-radius:6px; overflow:hidden; margin-bottom:8px; position:relative;">
          <img src="${areaImg}" alt="${name}" style="width:100%; height:100%; object-fit:cover;">
          <span style="position:absolute; top:4px; right:4px; font-size:0.7rem; font-weight:700; padding:2px 6px; border-radius:4px; background:rgba(0,0,0,0.6); color:white;">
            ${id}
          </span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <strong style="color:#0f172a; font-size: 0.95rem;">${name}</strong>
          <span class="badge badge-${status.toLowerCase()}">${status}</span>
        </div>
        <div style="font-size: 0.8rem; color:#64748b; margin-bottom: 8px;">
          <i class="fas fa-map-marker-alt"></i> ${location}
        </div>
        <div style="background:#f1f5f9; padding:6px 8px; border-radius:6px; margin-bottom:8px; font-size:0.8rem;">
          <div><strong>Waste Type:</strong> ${waste_type}</div>
          <div><strong>Fill Level:</strong> ${fill_level}%</div>
          <div><strong>Est. Overflow In:</strong> <span style="color:#6d28d9; font-weight:700;">${predicted_hours_until_full} hrs</span></div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" style="flex:1;" onclick="emptyDustbin('${id}')">
            <i class="fas fa-recycle"></i> Empty
          </button>
          <button class="btn btn-sm btn-outline" style="color:#ef4444; border-color:#fca5a5;" onclick="openComplaintModal('${id}')" title="Report Waste Problem">
            <i class="fas fa-bullhorn"></i> Complain
          </button>
          <button class="btn btn-sm btn-outline" onclick="openPredictModal('${id}')" title="Run ML Prediction">
            <i class="fas fa-brain"></i>
          </button>
        </div>
      </div>
    `;

    if (state.markers[id]) {
      state.markers[id].setLatLng([latitude, longitude]);
      state.markers[id].setIcon(customIcon);
      state.markers[id].setPopupContent(popupHtml);
    } else {
      const marker = L.marker([latitude, longitude], { icon: customIcon }).addTo(state.map);
      marker.bindPopup(popupHtml);
      state.markers[id] = marker;
    }
  });
}

// --- Dynamic Telemetric Analytics Data Visualizations ---
function initCharts() {
  if (!state.analytics) return;

  // 1. Fill Status Distribution (Doughnut Chart)
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx) {
    const summary = state.analytics.summary;
    state.charts.status = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Normal (<50%)', 'Moderate (50-79%)', 'Critical (>=80%)'],
        datasets: [{
          data: [summary.normal_count, summary.moderate_count, summary.critical_count],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        },
        cutout: '70%'
      }
    });
  }

  // 2. 24-Hour Waste Generation Trend (Line Chart)
  const trendsCtx = document.getElementById('trendsChart');
  if (trendsCtx && state.analytics.hourly_trends) {
    const h = state.analytics.hourly_trends;
    state.charts.trends = new Chart(trendsCtx, {
      type: 'line',
      data: {
        labels: h.hours,
        datasets: [
          {
            label: 'Commercial Zone',
            data: h.commercial,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.35,
            fill: true
          },
          {
            label: 'Transit Hub',
            data: h.transit,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.08)',
            tension: 0.35,
            fill: true
          },
          {
            label: 'Residential Zone',
            data: h.residential,
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            tension: 0.35,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: {
            title: { display: true, text: 'Waste Fill %' },
            min: 0,
            max: 100
          }
        }
      }
    });
  }

  // 3. Waste by Category (Pie Chart)
  const categoryCtx = document.getElementById('categoryChart');
  if (categoryCtx && state.analytics.waste_by_category) {
    const cats = state.analytics.waste_by_category;
    state.charts.category = new Chart(categoryCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(cats),
        datasets: [{
          data: Object.values(cats),
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // 4. Area-wise Fill Levels (Bar Chart)
  const areaCtx = document.getElementById('areaChart');
  if (areaCtx && state.analytics.waste_by_zone) {
    const zones = state.analytics.waste_by_zone;
    state.charts.area = new Chart(areaCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(zones),
        datasets: [{
          label: 'Dustbins Deployed',
          data: Object.values(zones),
          backgroundColor: '#059669',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }

  // 5. Weekly Collection Performance (Bar Chart)
  const weeklyCtx = document.getElementById('weeklyChart');
  if (weeklyCtx && state.analytics.weekly_stats) {
    const w = state.analytics.weekly_stats;
    state.charts.weekly = new Chart(weeklyCtx, {
      type: 'bar',
      data: {
        labels: w.days,
        datasets: [{
          label: 'Waste Volume Collected (Kg)',
          data: w.collected_volume_kg,
          backgroundColor: '#3b82f6',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' }
        }
      }
    });
  }
}

function updateChartData() {
  if (!state.analytics) return;
  const summary = state.analytics.summary;

  if (state.charts.status) {
    state.charts.status.data.datasets[0].data = [
      summary.normal_count,
      summary.moderate_count,
      summary.critical_count
    ];
    state.charts.status.update();
  }
}

// --- Render Dustbin Cards and Table ---
function renderDustbins() {
  const filtered = state.dustbins.filter(bin => {
    const matchesSearch = bin.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
                          bin.id.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
                          bin.location.toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesStatus = state.filterStatus === 'all' || bin.status.toLowerCase() === state.filterStatus.toLowerCase();
    const matchesType = state.filterType === 'all' || bin.waste_type.toLowerCase() === state.filterType.toLowerCase();
    return matchesSearch && matchesStatus && matchesType;
  });

  // Render Grid
  const gridContainer = document.getElementById('dustbin-grid');
  if (gridContainer) {
    if (filtered.length === 0) {
      gridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: white; border-radius: 12px; border: 1px dashed #cbd5e1;">
          <i class="fas fa-trash-alt" style="font-size: 2.5rem; color: #94a3b8; margin-bottom: 1rem;"></i>
          <h3>No dustbins found</h3>
          <p style="color: #64748b;">Try adjusting your search criteria or add a new dustbin.</p>
        </div>
      `;
    } else {
      gridContainer.innerHTML = filtered.map(bin => {
        const barClass = bin.fill_level >= 80 ? 'bar-red' : (bin.fill_level >= 50 ? 'bar-yellow' : 'bar-green');
        const isCritical = bin.fill_level >= 80 ? 'critical-border' : '';
        const areaImg = bin.image || 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80';
        return `
          <div class="bin-card ${isCritical}" id="bin-card-${bin.id}">
            <!-- Area Picture Banner -->
            <div style="position:relative; width:100%; height:130px; border-radius:8px; overflow:hidden; margin-bottom:12px; background:#e2e8f0;">
              <img src="${areaImg}" alt="${bin.name}" style="width:100%; height:100%; object-fit:cover;">
              <span style="position:absolute; bottom:6px; left:6px; background:rgba(15,23,42,0.85); backdrop-filter:blur(4px); color:white; font-size:0.75rem; padding:2px 8px; border-radius:4px; font-weight:600;">
                <i class="fas fa-map-pin" style="color:#34d399;"></i> ${bin.zone}
              </span>
              <button onclick="openComplaintModal('${bin.id}')" title="Report a problem in this area" style="position:absolute; top:6px; right:6px; background:#ef4444; border:none; color:white; font-size:0.75rem; padding:3px 8px; border-radius:4px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:4px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
                <i class="fas fa-bullhorn"></i> Complain
              </button>
            </div>

            <div class="bin-card-header">
              <div class="bin-title-group">
                <h3>${bin.name}</h3>
                <span class="bin-id">${bin.id} • ${bin.waste_type}</span>
              </div>
              <span class="badge badge-${bin.status.toLowerCase()}">${bin.status}</span>
            </div>

            <div class="bin-location">
              <i class="fas fa-map-marker-alt" style="color:#ef4444;"></i> ${bin.location}
            </div>

            <div class="fill-meter-container" style="display:flex; align-items:center; gap:14px; margin-bottom:1rem; background:rgba(255,255,255,0.02); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
              <!-- Visual Mini Glass Cylinder Graphic -->
              <div style="width:36px; height:64px; border-radius:6px; border:2px solid rgba(255,255,255,0.25); background:rgba(0,0,0,0.5); position:relative; overflow:hidden; flex-shrink:0; box-shadow: inset 0 0 10px rgba(0,0,0,0.8);" title="Physical container capacity depth">
                <div style="position:absolute; bottom:0; left:0; width:100%; height:${bin.fill_level}%; background:${bin.fill_level >= 80 ? 'linear-gradient(180deg, #f87171, #ef4444)' : (bin.fill_level >= 50 ? 'linear-gradient(180deg, #fbbf24, #f59e0b)' : 'linear-gradient(180deg, #34d399, #10b981)')}; transition: height 0.6s ease; box-shadow: 0 0 10px ${bin.status_color};"></div>
                <div style="position:absolute; top:2px; left:2px; right:2px; height:3px; border-radius:2px; background:rgba(255,255,255,0.4);"></div>
              </div>

              <!-- Bar & Percentage -->
              <div style="flex:1;">
                <div class="fill-meta" style="margin-bottom:0.25rem;">
                  <span style="font-size:0.75rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Sensor Fill</span>
                  <span class="fill-percentage" style="color: ${bin.status_color}; font-size:1.45rem;">${bin.fill_level}%</span>
                </div>
                <div class="fill-progress-track">
                  <div class="fill-progress-bar ${barClass}" style="width: ${bin.fill_level}%;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:0.72rem; color:#64748b;">
                  <span>${bin.capacity_liters} Liters</span>
                  <span><i class="fas fa-signal" style="color:#10b981;"></i> 99.8% Online</span>
                </div>
              </div>
            </div>

            <div class="bin-specs-grid">
              <div class="spec-item">
                <span>Capacity</span>
                <span>${bin.capacity_liters} Liters</span>
              </div>
              <div class="spec-item">
                <span>Battery</span>
                <span><i class="fas fa-battery-three-quarters" style="color:#10b981;"></i> ${bin.battery_level}%</span>
              </div>
              <div class="spec-item">
                <span>Zone</span>
                <span>${bin.zone}</span>
              </div>
              <div class="spec-item">
                <span>Fill Rate</span>
                <span>${bin.base_fill_rate}% / hr</span>
              </div>
            </div>

            <div class="ai-prediction-badge">
              <i class="fas fa-brain"></i>
              <span>Full in <strong>${bin.predicted_hours_until_full} hrs</strong> (${bin.estimated_full_time})</span>
            </div>

            <div class="bin-card-actions">
              <button class="btn btn-sm btn-primary" style="flex:1;" onclick="emptyDustbin('${bin.id}')">
                <i class="fas fa-recycle"></i> Empty
              </button>
              <button class="btn btn-sm btn-outline" title="Simulate +10% waste deposit" onclick="simulateFill('${bin.id}')">
                <i class="fas fa-plus"></i> Simulate
              </button>
              <button class="btn btn-sm btn-outline" title="Predict Overflow Time" onclick="openPredictModal('${bin.id}')">
                <i class="fas fa-chart-line"></i>
              </button>
              <button class="btn btn-sm btn-outline" title="Edit Dustbin" onclick="openEditModal('${bin.id}')">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-outline" style="color:#ef4444;" title="Delete" onclick="deleteDustbin('${bin.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Table
  const tableBody = document.getElementById('dustbin-table-body');
  if (tableBody) {
    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color:#64748b;">No dustbins matching your filters.</td></tr>`;
    } else {
      tableBody.innerHTML = filtered.map(bin => {
        const areaImg = bin.image || 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80';
        return `
        <tr>
          <td><strong>${bin.id}</strong></td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${areaImg}" alt="${bin.name}" style="width:48px; height:48px; border-radius:6px; object-fit:cover; flex-shrink:0;">
              <div>
                <div style="font-weight:600; color:#0f172a;">${bin.name}</div>
                <div style="font-size:0.75rem; color:#64748b;">${bin.location}</div>
              </div>
            </div>
          </td>
          <td><span class="badge" style="background:#f1f5f9; color:#334155;">${bin.waste_type}</span></td>
          <td>
            <div style="display:flex; align-items:center; gap: 8px;">
              <span style="font-weight:700; min-width:35px; color:${bin.status_color};">${bin.fill_level}%</span>
              <div class="fill-progress-track" style="width: 80px; height: 8px;">
                <div class="fill-progress-bar ${bin.fill_level >= 80 ? 'bar-red' : (bin.fill_level >= 50 ? 'bar-yellow' : 'bar-green')}" style="width: ${bin.fill_level}%;"></div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-${bin.status.toLowerCase()}">${bin.status}</span></td>
          <td><span style="color:#6d28d9; font-weight:600;">${bin.predicted_hours_until_full} hrs</span></td>
          <td><span style="font-size:0.8rem; color:#475569;">${bin.last_updated}</span></td>
          <td>
            <div style="display:flex; gap: 4px;">
              <button class="btn btn-sm btn-primary" onclick="emptyDustbin('${bin.id}')" title="Empty Bin">
                <i class="fas fa-recycle"></i>
              </button>
              <button class="btn btn-sm btn-outline" style="color:#ef4444;" onclick="openComplaintModal('${bin.id}')" title="Report Issue">
                <i class="fas fa-bullhorn"></i>
              </button>
              <button class="btn btn-sm btn-outline" onclick="simulateFill('${bin.id}')" title="Simulate Fill">
                <i class="fas fa-plus"></i>
              </button>
              <button class="btn btn-sm btn-outline" onclick="openEditModal('${bin.id}')" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-outline" style="color:#ef4444;" onclick="deleteDustbin('${bin.id}')" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `; }).join('');
    }
  }
}

function setQuickFilter(status, btnElement) {
  state.filterStatus = status;
  const select = document.getElementById('filter-status-select');
  if (select) select.value = status;
  if (btnElement && btnElement.parentElement) {
    const pills = btnElement.parentElement.querySelectorAll('button');
    pills.forEach(p => {
      p.className = 'btn btn-sm btn-outline';
    });
    btnElement.className = 'btn btn-sm btn-primary';
  }
  renderDustbins();
}

function setupFilterControls() {
  const searchInput = document.getElementById('search-dustbin-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderDustbins();
    });
  }

  const statusFilter = document.getElementById('filter-status-select');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      state.filterStatus = e.target.value;
      renderDustbins();
    });
  }

  const typeFilter = document.getElementById('filter-type-select');
  if (typeFilter) {
    typeFilter.addEventListener('change', (e) => {
      state.filterType = e.target.value;
      renderDustbins();
    });
  }
}

// --- CRUD Operations ---
async function emptyDustbin(binId) {
  const res = await apiCall(`/api/dustbins/${binId}/empty`, 'POST');
  if (res && res.success) {
    showToast(`Dustbin ${binId} successfully emptied and logged!`, 'success');
    await loadInitialData();
    renderDustbins();
    updateMapMarkers();
  }
}

async function simulateFill(binId) {
  const res = await apiCall(`/api/dustbins/${binId}/simulate`, 'POST');
  if (res && res.success) {
    const updated = res.data;
    showToast(`Simulated sensor deposit: ${binId} fill is now ${updated.fill_level}%`, updated.fill_level >= 80 ? 'danger' : 'info');
    await loadInitialData();
    renderDustbins();
    updateMapMarkers();
  }
}

async function simulateCitywideWaste() {
  const res = await apiCall('/api/dustbins/simulate-all', 'POST');
  if (res && res.success) {
    showToast('Simulated real-time waste increment across city sensor network!', 'info');
    await loadInitialData();
    renderDustbins();
    updateMapMarkers();
  }
}

async function dispatchCollectorRoute() {
  const res = await apiCall('/api/dispatch-collector', 'POST');
  if (res && res.success) {
    showToast(`Collection Truck Dispatched: Cleared ${res.cleared_count} critical bins (${res.liters_collected} Liters)`, 'success');
    await loadInitialData();
    renderDustbins();
    updateMapMarkers();
  }
}

async function deleteDustbin(binId) {
  if (!confirm(`Are you sure you want to permanently delete Dustbin ${binId}?`)) return;
  const res = await apiCall(`/api/dustbins/${binId}`, 'DELETE');
  if (res && res.success) {
    showToast(`Dustbin ${binId} deleted successfully`, 'warning');
    if (state.markers[binId]) {
      state.map.removeLayer(state.markers[binId]);
      delete state.markers[binId];
    }
    await loadInitialData();
    renderDustbins();
  }
}

// Modal handling
function openAddModal() {
  const modal = document.getElementById('dustbin-form-modal');
  if (!modal) return;
  document.getElementById('modal-title-text').innerText = 'Add New Smart Dustbin';
  document.getElementById('dustbin-form').reset();
  document.getElementById('form-bin-id').value = `BIN-${state.dustbins.length + 101}`;
  document.getElementById('form-bin-id').readOnly = false;
  document.getElementById('form-mode').value = 'create';
  modal.classList.add('active');
}

function openEditModal(binId) {
  const bin = state.dustbins.find(b => b.id.toUpperCase() === binId.toUpperCase());
  if (!bin) return;

  const modal = document.getElementById('dustbin-form-modal');
  if (!modal) return;
  document.getElementById('modal-title-text').innerText = `Edit Dustbin ${bin.id}`;
  document.getElementById('form-mode').value = 'edit';
  document.getElementById('form-bin-id').value = bin.id;
  document.getElementById('form-bin-id').readOnly = true;
  document.getElementById('form-name').value = bin.name;
  document.getElementById('form-location').value = bin.location;
  document.getElementById('form-latitude').value = bin.latitude;
  document.getElementById('form-longitude').value = bin.longitude;
  document.getElementById('form-fill').value = bin.fill_level;
  document.getElementById('form-capacity').value = bin.capacity_liters;
  document.getElementById('form-waste-type').value = bin.waste_type;
  document.getElementById('form-zone').value = bin.zone;
  document.getElementById('form-rate').value = bin.base_fill_rate;

  modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

async function handleDustbinFormSubmit(e) {
  e.preventDefault();
  const mode = document.getElementById('form-mode').value;
  const binId = document.getElementById('form-bin-id').value;

  const payload = {
    id: binId,
    name: document.getElementById('form-name').value,
    location: document.getElementById('form-location').value,
    latitude: parseFloat(document.getElementById('form-latitude').value),
    longitude: parseFloat(document.getElementById('form-longitude').value),
    fill_level: parseInt(document.getElementById('form-fill').value),
    capacity_liters: parseInt(document.getElementById('form-capacity').value),
    waste_type: document.getElementById('form-waste-type').value,
    zone: document.getElementById('form-zone').value,
    base_fill_rate: parseFloat(document.getElementById('form-rate').value)
  };

  let res;
  if (mode === 'create') {
    res = await apiCall('/api/dustbins', 'POST', payload);
  } else {
    res = await apiCall(`/api/dustbins/${binId}`, 'PUT', payload);
  }

  if (res && res.success) {
    showToast(`Dustbin ${binId} ${mode === 'create' ? 'created' : 'updated'} successfully!`, 'success');
    closeModal('dustbin-form-modal');
    await loadInitialData();
    renderDustbins();
    updateMapMarkers();
  } else if (res && res.error) {
    showToast(res.error, 'danger');
  }
}

// --- Machine Learning Prediction Modal ---
function openPredictModal(binId = null) {
  const modal = document.getElementById('predict-modal');
  if (!modal) return;

  if (binId) {
    const bin = state.dustbins.find(b => b.id.toUpperCase() === binId.toUpperCase());
    if (bin) {
      document.getElementById('pred-current-fill').value = bin.fill_level;
      document.getElementById('pred-fill-rate').value = bin.base_fill_rate;
      document.getElementById('pred-zone-activity').value = bin.zone_activity || 3;
    }
  }

  const now = new Date();
  document.getElementById('pred-hour').value = now.getHours();
  document.getElementById('pred-day').value = now.getDay() === 0 ? 6 : now.getDay() - 1;

  // Run prediction right away
  runMLPrediction();
  modal.classList.add('active');
}

async function runMLPrediction() {
  const payload = {
    current_fill: parseFloat(document.getElementById('pred-current-fill').value),
    base_fill_rate: parseFloat(document.getElementById('pred-fill-rate').value),
    hour_of_day: parseInt(document.getElementById('pred-hour').value),
    day_of_week: parseInt(document.getElementById('pred-day').value),
    zone_activity: parseInt(document.getElementById('pred-zone-activity').value)
  };

  const res = await apiCall('/api/predict', 'POST', payload);
  if (res && res.success) {
    const pred = res.prediction;
    const outputContainer = document.getElementById('pred-result-container');
    if (outputContainer) {
      const urgencyClass = pred.urgency === 'High' ? 'badge-critical' : (pred.urgency === 'Medium' ? 'badge-moderate' : 'badge-normal');
      outputContainer.innerHTML = `
        <div style="background:#f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
            <span style="font-size:0.85rem; font-weight:600; color:#64748b;">AI Prediction Result</span>
            <span class="badge ${urgencyClass}">${pred.urgency} Urgency</span>
          </div>
          <div style="font-size: 2.2rem; font-weight:800; color:#0f172a; margin-bottom: 0.25rem;">
            ${pred.predicted_hours_until_full} <span style="font-size:1.1rem; font-weight:500; color:#64748b;">Hours to 100% Full</span>
          </div>
          <div style="font-size:0.9rem; color:#475569; margin-bottom: 0.75rem;">
            <i class="far fa-clock"></i> Estimated Overflow Time: <strong>${pred.estimated_full_time}</strong>
          </div>
          <div style="background:#ede9fe; border-left: 4px solid #8b5cf6; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; color:#5b21b6; margin-bottom: 0.5rem;">
            <strong>AI Recommendation:</strong> ${pred.recommendation}
          </div>
          <div style="font-size:0.75rem; color:#94a3b8; text-align:right;">
            Model: ${pred.model_confidence}
          </div>
        </div>
      `;
    }
  }
}

// --- Citizen Complaints & Problem Reports ---
function renderComplaints() {
  const container = document.getElementById('complaints-container');
  const countEl = document.getElementById('kpi-complaints-count');
  if (countEl) {
    const active = state.complaints.filter(c => c.status !== 'Resolved').length;
    countEl.textContent = active;
  }

  if (!container) return;

  if (!state.complaints || state.complaints.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 2.5rem; background:white; border-radius:12px; border:1px dashed #cbd5e1;">
        <i class="fas fa-check-double" style="font-size:2.2rem; color:#10b981; margin-bottom:0.75rem;"></i>
        <h4>No active waste problems reported</h4>
        <p style="color:#64748b; font-size:0.9rem;">Citizens have reported zero unaddressed spillovers.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.complaints.map(cmp => {
    const isResolved = cmp.status === 'Resolved';
    const statusBadge = isResolved ? 'badge-normal' : (cmp.status === 'In Progress' ? 'badge-moderate' : 'badge-critical');
    const severityColor = cmp.severity === 'Critical' ? '#ef4444' : (cmp.severity === 'High' ? '#f59e0b' : '#3b82f6');
    const areaImg = cmp.image || 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop&q=80';

    return `
      <div class="card" style="margin-bottom:1.25rem; border-left: 4px solid ${severityColor};">
        <div class="card-body" style="padding:1.25rem;">
          <div style="display:flex; flex-wrap:wrap; gap:1.25rem; align-items:flex-start;">
            <div style="width:130px; height:100px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#f1f5f9; position:relative;">
              <img src="${areaImg}" alt="${cmp.bin_name}" style="width:100%; height:100%; object-fit:cover;">
              <span style="position:absolute; bottom:4px; left:4px; font-size:0.7rem; background:rgba(0,0,0,0.7); color:white; padding:1px 6px; border-radius:4px;">
                ${cmp.bin_id}
              </span>
            </div>

            <div style="flex:1; min-width:260px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.4rem;">
                <div>
                  <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">${cmp.ticket_no}</span>
                  <h4 style="font-size:1.05rem; font-weight:700; color:#0f172a; margin-top:2px;">${cmp.issue_type}</h4>
                </div>
                <div style="display:flex; gap:0.4rem;">
                  <span class="badge" style="background:#fee2e2; color:${severityColor}; border:1px solid #fecaca;">
                    <i class="fas fa-exclamation-triangle"></i> ${cmp.severity} Severity
                  </span>
                  <span class="badge ${statusBadge}">${cmp.status}</span>
                </div>
              </div>

              <div style="font-size:0.85rem; color:#475569; margin-bottom:0.5rem;">
                <i class="fas fa-map-marker-alt" style="color:#ef4444;"></i> <strong>${cmp.bin_name}</strong> • ${cmp.area_name}
              </div>

              <p style="font-size:0.9rem; color:#334155; background:#f8fafc; padding:8px 12px; border-radius:6px; margin-bottom:0.75rem;">
                "${cmp.description}"
              </p>

              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; font-size:0.8rem; color:#64748b;">
                <div>
                  <i class="fas fa-user"></i> Reported by <strong>${cmp.complainant_name}</strong> (${cmp.contact}) on ${cmp.created_at}
                </div>
                <div style="display:flex; gap:0.5rem;">
                  ${!isResolved ? `
                    <button class="btn btn-sm btn-primary" onclick="resolveComplaint('${cmp.id}')">
                      <i class="fas fa-check-circle"></i> Resolve & Dispatch Crew
                    </button>
                  ` : `
                    <span style="color:#10b981; font-weight:600;"><i class="fas fa-check-double"></i> Cleared</span>
                  `}
                  <button class="btn btn-sm btn-outline" style="color:#ef4444;" onclick="deleteComplaint('${cmp.id}')" title="Dismiss Complaint">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openComplaintModal(binId = null) {
  const modal = document.getElementById('complaint-form-modal');
  if (!modal) return;

  const binSelect = document.getElementById('complaint-bin-id');
  if (binSelect && state.dustbins) {
    binSelect.innerHTML = state.dustbins.map(b => `
      <option value="${b.id}" ${binId && b.id.toUpperCase() === binId.toUpperCase() ? 'selected' : ''}>
        ${b.id} - ${b.name} (${b.location}) [${b.fill_level}% Full]
      </option>
    `).join('');
  }

  // Pre-fill picture preview if available
  updateComplaintPhotoPreview();

  modal.classList.add('active');
}

function updateComplaintPhotoPreview() {
  const binSelect = document.getElementById('complaint-bin-id');
  const previewImg = document.getElementById('complaint-photo-preview');
  if (!binSelect || !previewImg) return;

  const selectedBin = state.dustbins.find(b => b.id === binSelect.value);
  if (selectedBin && selectedBin.image) {
    previewImg.src = selectedBin.image;
    previewImg.style.display = 'block';
  }
}

async function handleComplaintSubmit(e) {
  e.preventDefault();
  const binId = document.getElementById('complaint-bin-id').value;
  const targetBin = state.dustbins.find(b => b.id === binId);

  const payload = {
    bin_id: binId,
    bin_name: targetBin ? targetBin.name : 'Public Container',
    area_name: targetBin ? targetBin.location : 'Municipal Street',
    issue_type: document.getElementById('complaint-issue-type').value,
    severity: document.getElementById('complaint-severity').value,
    complainant_name: document.getElementById('complaint-name').value,
    contact: document.getElementById('complaint-contact').value,
    description: document.getElementById('complaint-desc').value,
    image: targetBin ? targetBin.image : ''
  };

  const res = await apiCall('/api/complaints', 'POST', payload);
  if (res && res.success) {
    showToast(`Grievance Registered: Ticket ${res.data.ticket_no} generated! Sanitation team alerted.`, 'warning');
    closeModal('complaint-form-modal');
    document.getElementById('complaint-form').reset();
    await loadInitialData();
  } else {
    showToast('Failed to register complaint. Please try again.', 'danger');
  }
}

async function resolveComplaint(cmpId) {
  const res = await apiCall(`/api/complaints/${cmpId}/resolve`, 'PUT');
  if (res && res.success) {
    showToast(`Ticket ${cmpId} resolved! Collection crew dispatched.`, 'success');
    await loadInitialData();
  }
}

async function deleteComplaint(cmpId) {
  if (!confirm(`Delete complaint record ${cmpId}?`)) return;
  const res = await apiCall(`/api/complaints/${cmpId}`, 'DELETE');
  if (res && res.success) {
    showToast(`Complaint ${cmpId} deleted`, 'info');
    await loadInitialData();
  }
}

