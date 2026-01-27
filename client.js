// Modal Functions
async function openModal(data) {
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

    // Add phone lookup section
    if (data.owner) {
        html += `
            <div id="phone-section" style="margin-top:10px; padding-top:10px; border-top:1px solid #ddd;">
                <button id="phone-lookup-btn" class="action-btn" style="padding:8px; width:100%;" onclick="lookupPhone('${data.owner}', '${data.mail_address || ''}', '${data.mail_city || ''}', '${data.mail_state || ''}')">
                    Find Phone Number
                </button>
                <div id="phone-results" style="margin-top:10px;"></div>
            </div>
        `;
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
const nearbyParcelsLayer = L.featureGroup().addTo(map); // Layer for nearby parcels

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
    nearbyParcelsLayer.clearLayers(); // Clear nearby parcels

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

            const nearbyBtnId = `nearby-btn-${markerId}`;
            const popupContent = `
                <b>Type:</b> ${tower.type}<br>
                <b>Sub-Type:</b> ${tower.subType || 'N/A'}<br>
                <div style="font-size:0.8em; color:#666; margin-bottom:5px;">ID: ${tower.id}</div>
                <hr>
                <button class="action-btn" style="padding:5px; font-size:12px;" onclick="getOwner(${tower.lat}, ${tower.lon}, '${resultDivId}')">Get Land Owner</button>
                <button class="action-btn" id="${nearbyBtnId}" style="padding:5px; font-size:12px; margin-left:5px;" onclick="getNearbyParcels(${tower.lat}, ${tower.lon}, '${nearbyBtnId}')">Show Nearby Parcels</button>
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
                const geoJsonLayer = L.geoJSON(parcel.geometry, {
                    style: {
                        color: '#ff0000',        // Bright red border
                        weight: 3,               // Border thickness
                        fillColor: '#ff0000',    // Red fill
                        fillOpacity: 0.2         // Semi-transparent fill
                    }
                }).addTo(parcelsLayer);

                // Zoom map to fit the parcel boundary
                map.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50] });
                console.log("Drew parcel polygon on map");
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

async function lookupPhone(name, address, city, state) {
    const btn = document.getElementById('phone-lookup-btn');
    const resultsDiv = document.getElementById('phone-results');

    btn.disabled = true;
    btn.innerText = 'Looking up...';
    resultsDiv.innerHTML = '<div style="color:#666; font-size:0.9em;">Searching for phone number...</div>';

    try {
        const params = new URLSearchParams({
            name: name,
            address: address,
            city: city,
            state: state
        });

        const response = await fetch(`/api/phone-lookup?${params}`);
        const data = await response.json();

        if (data.phones && data.phones.length > 0) {
            let phoneHtml = '<div style="margin-top:10px;">';
            data.phones.forEach(phone => {
                phoneHtml += `
                    <div class="data-row">
                        <div class="data-label">Phone (${phone.type}):</div>
                        <div class="data-value" style="font-weight:bold; color:#007bff;">
                            <a href="tel:${phone.number}" style="color:#007bff; text-decoration:none;">
                                ${phone.number}
                            </a>
                        </div>
                    </div>
                `;
            });
            phoneHtml += '</div>';
            resultsDiv.innerHTML = phoneHtml;
            btn.style.display = 'none';
        } else if (data.note) {
            resultsDiv.innerHTML = `<div style="color:#ff9800; font-size:0.9em;">${data.note}</div>`;
            btn.disabled = false;
            btn.innerText = 'Find Phone Number';
        } else {
            resultsDiv.innerHTML = '<div style="color:#999; font-size:0.9em;">No phone number found</div>';
            btn.disabled = false;
            btn.innerText = 'Try Again';
        }
    } catch (err) {
        console.error('Phone lookup error:', err);
        resultsDiv.innerHTML = '<div style="color:red; font-size:0.9em;">Failed to lookup phone</div>';
        btn.disabled = false;
        btn.innerText = 'Try Again';
    }
}

async function getNearbyParcels(lat, lon, btnId) {
    const btn = document.getElementById(btnId);
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Loading...";

    try {
        const response = await fetch(`/api/nearby-parcels?lat=${lat}&lon=${lon}&radius=0.002`);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error);
            alert(`Error: ${data.error}`);
            btn.innerText = originalText;
            btn.disabled = false;
            return;
        }

        if (data.parcels && data.parcels.length > 0) {
            console.log(`Found ${data.count} nearby parcels`);

            // Clear previous nearby parcels
            nearbyParcelsLayer.clearLayers();

            // Draw each nearby parcel
            data.parcels.forEach((parcel, index) => {
                if (parcel.geometry) {
                    const parcelLayer = L.geoJSON(parcel.geometry, {
                        style: {
                            color: '#3388ff',      // Blue border
                            weight: 2,
                            fillColor: '#3388ff',  // Blue fill
                            fillOpacity: 0.15
                        }
                    }).addTo(nearbyParcelsLayer);

                    // Add click handler to show parcel details
                    parcelLayer.on('click', function() {
                        openModal(parcel);
                    });

                    // Add tooltip with owner info
                    const tooltipContent = parcel.owner
                        ? `Owner: ${parcel.owner}`
                        : `Parcel ID: ${parcel.parcel_id || 'Unknown'}`;
                    parcelLayer.bindTooltip(tooltipContent, {
                        permanent: false,
                        direction: 'center'
                    });
                }
            });

            btn.innerText = `${data.count} Parcels Shown`;
            btn.style.background = '#17a2b8';
        } else {
            alert('No nearby parcels found');
            btn.innerText = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error("Nearby parcels fetch error:", err);
        alert('Failed to load nearby parcels');
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// Allow Enter key in search box
document.getElementById('searchInput').addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        searchLocation();
    }
});
