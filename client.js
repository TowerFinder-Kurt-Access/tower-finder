// Modal Functions
function openModal(data) {
    const modal = document.getElementById('ownerModal');
    const body = document.getElementById('modalBody');

    // Build content
    const fields = [
        { label: 'Owner', value: data.owner },
        { label: 'Site Name', value: data.sitename },
        { label: 'Address', value: data.prop_address },
        { label: 'Mailing Address', value: data.mail_address },
        { label: 'Mailing City/State', value: data.mail_city ? `${data.mail_city}, ${data.mail_state}` : '' },
        { label: 'Parcel ID (APN)', value: data.parcel_id },
        { label: 'County', value: data.county_name },
        { label: 'Municipality', value: data.muni_name },
        { label: 'Land Use', value: data.land_use || data.use_desc },
        { label: 'Acreage', value: data.acreage_calc || data.acreage_deed }
    ];

    let html = '';
    fields.forEach(f => {
        if (f.value) {
            html += `
                <div class="data-row">
                    <div class="data-label">${f.label}:</div>
                    <div class="data-value">${f.value}</div>
                </div>
            `;
        }
    });

    if (html === '') {
        html = '<div style="padding:20px; text-align:center; color:#777;">No detailed property information available.</div>';
    }

    // Add raw data toggle
    html += `
        <div style="margin-top:20px; padding-top:10px; border-top:1px solid #ddd;">
            <details>
                <summary style="cursor:pointer; color:#007bff; font-size:0.9em;">View Raw Data Source</summary>
                <pre style="background:#f8f9fa; padding:10px; font-size:11px; overflow:auto; border-radius:4px;">${JSON.stringify(data, null, 2)}</pre>
            </details>
        </div>
    `;

    body.innerHTML = html;
    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('ownerModal').style.display = 'none';
}

// Close on click outside
window.onclick = function (event) {
    const modal = document.getElementById('ownerModal');
    if (event.target == modal) {
        closeModal();
    }
}

// Initialize Map
const map = L.map('map').setView([37.7749, -122.4194], 13);
const markersLayer = L.featureGroup().addTo(map);
const parcelsLayer = L.featureGroup().addTo(map); // Layer for parcel polygons

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

async function searchLocation() {
    const query = document.getElementById('searchInput').value;
    if (!query) return;

    // Check if input is Lat,Lon
    const latLonMatch = query.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (latLonMatch) {
        const lat = parseFloat(latLonMatch[1]);
        const lon = parseFloat(latLonMatch[3]);
        map.setView([lat, lon], 14);
        return;
    }

    // Otherwise, geocode using backend API
    try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            map.setView([lat, lon], 14);
        } else {
            alert('Location not found!');
        }
    } catch (err) {
        console.error("Geocoding error:", err);
        alert('Error searching for location.');
    }
}

async function searchCurrentArea() {
    const btn = document.getElementById('searchAreaBtn');
    const stats = document.getElementById('stats');

    btn.disabled = true;
    btn.innerText = "Searching...";
    stats.innerText = "Querying Overpass API...";

    markersLayer.clearLayers();
    parcelsLayer.clearLayers(); // Clear old polygons

    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    try {
        const response = await fetch(`/api/towers?bbox=${bbox}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        stats.innerText = `Found ${data.length} towers.`;

        let markerId = 0;
        data.forEach(tower => {
            markerId++;
            let color = 'blue';
            if (tower.type === 'mast') color = 'red';

            // Unique ID for the result div
            const resultDivId = `owner-result-${markerId}`;

            const popupContent = `
                <b>Type:</b> ${tower.type}<br>
                <b>Sub-Type:</b> ${tower.subType || 'N/A'}<br>
                <div style="font-size:0.8em; color:#666; margin-bottom:5px;">ID: ${tower.id}</div>
                <hr>
                <button class="action-btn" style="padding:5px; font-size:12px;" onclick="getOwner(${tower.lat}, ${tower.lon}, '${resultDivId}')">Get Land Owner</button>
                <div id="${resultDivId}" style="margin-top:5px; font-weight:bold; color:#333;"></div>
            `;

            const marker = L.marker([tower.lat, tower.lon])
                .bindPopup(popupContent);
            markersLayer.addLayer(marker);
        });

    } catch (err) {
        console.error("Search error:", err);
        stats.innerText = "Error fetching towers.";
    } finally {
        btn.disabled = false;
        btn.innerText = "Search This Area";
    }
}

async function getOwner(lat, lon, divId) {
    const div = document.getElementById(divId);
    div.innerText = "Loading owner info...";

    try {
        const response = await fetch(`/api/owner?lat=${lat}&lon=${lon}`);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error);
            div.innerHTML = `<span style="color:red">Error: ${data.error.message || data.error}</span>`;
        } else if (data.result) {
            const parcel = data.result;
            console.log("Found parcel:", parcel);

            // Show success message
            div.innerHTML = `<button class="action-btn" style="background:#28a745; margin-top:5px;" onclick='openModal(${JSON.stringify(parcel).replace(/'/g, "&#39;")})'>View Owner Details</button>`;

            // Draw Polygon (Geometry is now pre-parsed by server)
            if (parcel.geometry) {
                L.geoJSON(parcel.geometry, {
                    style: {
                        color: 'red',
                        weight: 3,
                        fillOpacity: 0.1
                    }
                }).addTo(parcelsLayer);
            } else {
                console.warn("No geometry found in parcel result");
            }

            openModal(parcel);

        } else {
            div.innerText = "No owner info found.";
        }
    } catch (err) {
        console.error("Owner fetch error:", err);
        div.innerText = "Failed to load owner.";
    }
}

// Allow Enter key in search box
document.getElementById('searchInput').addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        searchLocation();
    }
});
