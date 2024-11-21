// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWF0dGhld2ptaWxsZXI3IiwiYSI6ImNtM3FldDJnbDBuanAybW9ocDBiYjRiN3AifQ.IajKfJWkk1hh89U6bU6fKQ';

// Initialize the map
var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-98.5795, 39.8283], // Centered over the contiguous USA
    zoom: 4
});

// Add navigation controls to the map
map.addControl(new mapboxgl.NavigationControl());

// Data structures to store visited locations
var visitedStates = new Set();
var visitedCities = new Set();
var visitedZipCodes = new Set();
var visitedCountries = new Set();
var allData = []; // Stores all visited locations

// Global variable to store markers
var markerGroup = [];

// Function to add a marker to the map
function addMarker(lat, lon, popupText, location) {
    var popupContent = `
        <div>
            <p>${popupText}</p>
            <button id="livedInButton" class="btn btn-secondary btn-sm">Mark as Lived In</button>
        </div>
    `;

    var marker = new mapboxgl.Marker()
        .setLngLat([lon, lat])
        .setPopup(new mapboxgl.Popup().setHTML(popupContent))
        .addTo(map);

    // Add marker to markerGroup
    markerGroup.push(marker);

    // Event listener for "Mark as Lived In" button
    marker.getPopup().on('open', function() {
        // Use event delegation to handle dynamic elements
        document.getElementById('livedInButton').addEventListener('click', function() {
            markAsLivedIn(location);
            marker.getPopup().remove(); // Close the popup after marking
        });
    });
}

// Function to mark a location as "Lived In"
function markAsLivedIn(location) {
    location.livedIn = true;
    saveData();
    updateCitiesTable(); // Update the cities table to reflect the change
    alert(`Marked ${location.city}, ${location.state} as lived in.`);
}

// Function to add a location to the data structures and update the map and chart
function addLocation(lat, lon, city, state, zip, country) {
    // Check if the location already exists
    var existingLocation = allData.find(loc => loc.lat === lat && loc.lon === lon);

    if (existingLocation) {
        existingLocation.visitCount += 1;
    } else {
        var newLocation = {
            lat,
            lon,
            city,
            state,
            zip,
            country,
            visitCount: 1,
            livedIn: false
        };
        allData.push(newLocation);
    }

    // Add to data structures
    if (state) visitedStates.add(state);
    if (city) visitedCities.add(city);
    if (zip) visitedZipCodes.add(zip);
    if (country) visitedCountries.add(country);

    // Add marker
    var popupText = `${city || ''}${city && state ? ', ' : ''}${state || ''}`;
    addMarker(lat, lon, popupText, existingLocation || newLocation);

    // Update visualizations
    updateChart();
    updateStatesTable();
    updateCitiesTable();
    updateCountriesTable();
    updateZipCodesTable();

    // Update heatmap data if available
    if (map.getSource('visited-places')) {
        map.getSource('visited-places').setData(getVisitedPlacesGeoJSON());
    }

    // Save data
    saveData();
}

// Function to update the chart using D3.js
function updateChart() {
    // Clear previous chart
    d3.select('#chart').html('');

    // Data for the chart
    var data = [
        { label: 'Countries', value: visitedCountries.size },
        { label: 'States', value: visitedStates.size },
        { label: 'Cities', value: visitedCities.size },
        { label: 'ZIP Codes', value: visitedZipCodes.size }
    ];

    var width = 600;
    var height = 400;
    var margin = { top: 40, right: 20, bottom: 50, left: 60 };

    var svg = d3.select('#chart')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    var x = d3.scaleBand()
        .domain(data.map(d => d.label))
        .range([margin.left, width - margin.right])
        .padding(0.4);

    var y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) + 1])
        .nice()
        .range([height - margin.bottom, margin.top]);

    var xAxis = g => g
        .attr('transform', `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(x));

    var yAxis = g => g
        .attr('transform', `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(y).ticks(null, data.format));

    svg.append('g')
        .selectAll('rect')
        .data(data)
        .join('rect')
        .attr('x', d => x(d.label))
        .attr('y', d => y(d.value))
        .attr('height', d => y(0) - y(d.value))
        .attr('width', x.bandwidth())
        .attr('fill', '#1f77b4');

    svg.append('g').call(xAxis);
    svg.append('g').call(yAxis);

    // Add labels
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top / 2)
        .attr('text-anchor', 'middle')
        .attr('font-size', '24px')
        .text('Places Visited');
}

// Function to fetch coordinates from GeoNames API
function fetchCoordinates(query, type) {
    var username = 'matthewjmiller07'; // Use your GeoNames username 
    var url = '';

    if (type === 'city') {
        url = `https://secure.geonames.org/searchJSON?q=${encodeURIComponent(query)}&maxRows=10&username=${username}`;
    } else if (type === 'state') {
        url = `https://secure.geonames.org/searchJSON?adminName1=${encodeURIComponent(query)}&country=US&maxRows=1&username=${username}`;
    } else if (type === 'zip') {
        url = `https://secure.geonames.org/postalCodeSearchJSON?postalcode=${encodeURIComponent(query)}&country=US&maxRows=1&username=${username}`;
    }

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if ((data.geonames && data.geonames.length > 0) || (data.postalCodes && data.postalCodes.length > 0)) {
                if (type === 'city' && data.geonames.length > 1) {
                    // Multiple city results found, prompt user to select
                    displayCityOptions(data.geonames, query);
                } else {
                    // Process single result
                    var result = data.geonames ? data.geonames[0] : data.postalCodes[0];
                    processLocationResult(result, type);
                }
            } else {
                alert('Location not found. Please try again.');
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });
}

// Event listeners for buttons
document.getElementById('addCity').addEventListener('click', function() {
    var city = document.getElementById('cityInput').value;
    if (city) {
        fetchCoordinates(city, 'city');
        document.getElementById('cityInput').value = '';
    }
});

document.getElementById('addState').addEventListener('click', function() {
    var state = document.getElementById('stateInput').value;
    if (state) {
        fetchCoordinates(state, 'state');
        document.getElementById('stateInput').value = '';
    }
});

document.getElementById('addZip').addEventListener('click', function() {
    var zip = document.getElementById('zipInput').value;
    if (zip) {
        fetchCoordinates(zip, 'zip');
        document.getElementById('zipInput').value = '';
    }
});

// Function to display city options when multiple results are found
function displayCityOptions(results, query) {
    // Create options for the select dropdown
    var options = results.map((result, index) => {
        return `<option value="${index}">${result.name}, ${result.adminName1}, ${result.countryName}</option>`;
    }).join('');

    // Create the modal HTML using Bootstrap classes
    var modalHTML = `
        <div id="citySelectionModal" class="modal fade in" tabindex="-1" role="dialog" style="display:block;">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Select the correct location for "${query}"</h5>
                        <button type="button" class="close" id="closeModal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <select id="citySelect" class="form-control">
                            ${options}
                        </select>
                    </div>
                    <div class="modal-footer">
                        <button type="button" id="selectCityButton" class="btn btn-primary">Select</button>
                        <button type="button" class="btn btn-secondary" id="cancelModal">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append the modal to the body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Initialize Bootstrap modal
    $('#citySelectionModal').modal({
        backdrop: 'static',
        keyboard: false
    });

    // Event listener for the select button
    document.getElementById('selectCityButton').addEventListener('click', function() {
        var selectedIndex = document.getElementById('citySelect').value;
        var selectedResult = results[selectedIndex];
        processLocationResult(selectedResult, 'city');
        closeModal();
    });

    // Event listener for the close button
    document.getElementById('closeModal').addEventListener('click', closeModal);

    // Event listener for the cancel button
    document.getElementById('cancelModal').addEventListener('click', closeModal);

    function closeModal() {
        var modal = document.getElementById('citySelectionModal');
        if (modal) {
            $(modal).modal('hide');
            modal.parentNode.removeChild(modal);
        }
    }
}

// Function to process a single location result
function processLocationResult(result, type) {
    var lat = parseFloat(result.lat);
    var lon = parseFloat(result.lng || result.lon);
    var state = result.adminName1;
    var city = result.name || result.placeName;
    var zip = result.postalcode || '';
    var country = result.countryName || '';

    // Use the addLocation function to add the location
    addLocation(lat, lon, city, state, zip, country);
}

// Function to update the states table
function updateStatesTable() {
    // Clear previous table
    d3.select('#statesTable').html('');

    var data = Array.from(visitedStates).sort();

    var table = d3.select('#statesTable').append('table').attr('class', 'table table-striped table-bordered');
    var thead = table.append('thead');
    var tbody = table.append('tbody');

    // Header
    thead.append('tr')
        .append('th')
        .text('State');

    // Rows
    var rows = tbody.selectAll('tr')
        .data(data)
        .enter()
        .append('tr');

    // Cells
    rows.append('td')
        .text(d => d);
}

// Function to update the cities table
function updateCitiesTable() {
    // Clear previous table
    d3.select('#citiesTable').html('');

    // Convert allData to an array of unique city-state combinations
    var data = Array.from(visitedCities).map(cityName => {
        // Find all locations that match the city
        var locations = allData.filter(d => d.city === cityName);
        // Aggregate states if the same city exists in multiple states
        var states = Array.from(new Set(locations.map(loc => loc.state))).sort();
        var stateString = states.join(', ');
        // Check if any of the locations are marked as lived in
        var livedIn = locations.some(loc => loc.livedIn);
        return {
            city: cityName,
            state: stateString,
            livedIn: livedIn ? 'Yes' : 'No'
        };
    });

    data.sort((a, b) => a.city.localeCompare(b.city));

    var table = d3.select('#citiesTable').append('table').attr('class', 'table table-striped table-bordered');
    var thead = table.append('thead');
    var tbody = table.append('tbody');

    // Header
    thead.append('tr')
        .selectAll('th')
        .data(['City', 'State', 'Lived In'])
        .enter()
        .append('th')
        .text(d => d);

    // Rows
    var rows = tbody.selectAll('tr')
        .data(data)
        .enter()
        .append('tr');

    // Cells
    rows.selectAll('td')
        .data(d => [d.city, d.state, d.livedIn])
        .enter()
        .append('td')
        .text(d => d);
}

// Function to update the countries table
function updateCountriesTable() {
    // Clear previous table
    d3.select('#countriesTable').html('');

    var data = Array.from(visitedCountries).sort();

    var table = d3.select('#countriesTable').append('table').attr('class', 'table table-striped table-bordered');
    var thead = table.append('thead');
    var tbody = table.append('tbody');

    // Header
    thead.append('tr')
        .append('th')
        .text('Country');

    // Rows
    var rows = tbody.selectAll('tr')
        .data(data)
        .enter()
        .append('tr');

    // Cells
    rows.append('td')
        .text(d => d);
}

// Function to update the ZIP Codes table
function updateZipCodesTable() {
    // Clear previous table
    d3.select('#zipCodesTable').html('');

    var data = Array.from(visitedZipCodes).sort();

    var table = d3.select('#zipCodesTable').append('table').attr('class', 'table table-striped table-bordered');
    var thead = table.append('thead');
    var tbody = table.append('tbody');

    // Header
    thead.append('tr')
        .append('th')
        .text('ZIP Code');

    // Rows
    var rows = tbody.selectAll('tr')
        .data(data)
        .enter()
        .append('tr');

    // Cells
    rows.append('td')
        .text(d => d);
}

// Function to update the heatmap using Mapbox
function updateHeatmap() {
    if (!map.getSource('visited-places')) {
        // Add a source for the heatmap
        map.addSource('visited-places', {
            type: 'geojson',
            data: getVisitedPlacesGeoJSON()
        });

        // Add a heatmap layer
        map.addLayer({
            id: 'heatmap-layer',
            type: 'heatmap',
            source: 'visited-places',
            maxzoom: 15,
            paint: {
                // Increase the heatmap weight based on frequency of visits
                'heatmap-weight': ['interpolate', ['linear'], ['get', 'visitCount'], 0, 0, 6, 1],
                // Increase the heatmap intensity based on zoom level
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
                // Color ramp for heatmap
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(33,102,172,0)',
                    0.2, 'rgb(103,169,207)',
                    0.4, 'rgb(209,229,240)',
                    0.6, 'rgb(253,219,199)',
                    0.8, 'rgb(239,138,98)',
                    1, 'rgb(178,24,43)'
                ],
                // Adjust the heatmap radius by zoom level
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 15, 20],
                // Transition from heatmap to circle layer by zoom level
                'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 1, 15, 0]
            }
        });

        // Add a circle layer to show individual points when zoomed in
        map.addLayer({
            id: 'heatmap-point',
            type: 'circle',
            source: 'visited-places',
            minzoom: 14,
            paint: {
                'circle-radius': 4,
                'circle-color': '#ff0000',
                'circle-opacity': ['case', ['boolean', ['get', 'livedIn'], false], 1, 0.6]
            }
        });
    } else {
        // Update the data for the heatmap source
        map.getSource('visited-places').setData(getVisitedPlacesGeoJSON());
    }
}

// Function to get GeoJSON data for the heatmap
function getVisitedPlacesGeoJSON() {
    return {
        type: 'FeatureCollection',
        features: allData.map(location => ({
            type: 'Feature',
            properties: {
                visitCount: location.visitCount,
                livedIn: location.livedIn
            },
            geometry: {
                type: 'Point',
                coordinates: [location.lon, location.lat]
            }
        }))
    };
}

// Function to reset all data and the map
function resetData() {
    if (confirm('Are you sure you want to reset all data? This action cannot be undone.')) {
        // Clear data structures
        visitedStates.clear();
        visitedCities.clear();
        visitedZipCodes.clear();
        visitedCountries.clear();
        allData = [];

        // Remove all markers from the map
        markerGroup.forEach(marker => marker.remove());
        markerGroup = [];

        // Remove heatmap layers and sources
        if (map.getLayer('heatmap-layer')) {
            map.removeLayer('heatmap-layer');
        }
        if (map.getLayer('heatmap-point')) {
            map.removeLayer('heatmap-point');
        }
        if (map.getSource('visited-places')) {
            map.removeSource('visited-places');
        }

        // Clear localStorage
        localStorage.clear();

        // Update visualizations
        updateChart();
        updateStatesTable();
        updateCitiesTable();
        updateCountriesTable();
        updateZipCodesTable();

        alert('All data has been reset.');
    }
}

// Event listener for the reset button
document.getElementById('resetMap').addEventListener('click', resetData);

// Function to initialize the heatmap when the map loads
map.on('load', function() {
    // Initialize the heatmap with existing data
    updateHeatmap();
});

// Function to handle map clicks
map.on('click', function(e) {
    var lon = e.lngLat.lng;
    var lat = e.lngLat.lat;

    // Reverse geocoding to get nearby places
    var username = 'matthewjmiller07'; // Replace with your GeoNames username
    var url = `https://secure.geonames.org/findNearbyPlaceNameJSON?lat=${lat}&lng=${lon}&radius=10&maxRows=10&username=${username}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.geonames && data.geonames.length > 0) {
                if (data.geonames.length > 1) {
                    // Multiple places found, prompt user to select
                    displayCityOptions(data.geonames, data.geonames[0].name);
                } else {
                    var result = data.geonames[0];
                    processLocationResult(result, 'city');
                }
            } else {
                alert('No nearby location found.');
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
        });
});

// Save data to localStorage
function saveData() {
    localStorage.setItem('allData', JSON.stringify(allData));
    localStorage.setItem('visitedStates', JSON.stringify([...visitedStates]));
    localStorage.setItem('visitedCities', JSON.stringify([...visitedCities]));
    localStorage.setItem('visitedZipCodes', JSON.stringify([...visitedZipCodes]));
    localStorage.setItem('visitedCountries', JSON.stringify([...visitedCountries]));
}

// Load data from localStorage
function loadData() {
    var data = JSON.parse(localStorage.getItem('allData'));
    var states = JSON.parse(localStorage.getItem('visitedStates'));
    var cities = JSON.parse(localStorage.getItem('visitedCities'));
    var zips = JSON.parse(localStorage.getItem('visitedZipCodes'));
    var countries = JSON.parse(localStorage.getItem('visitedCountries'));

    if (data) {
        allData = data;
        visitedStates = new Set(states);
        visitedCities = new Set(cities);
        visitedZipCodes = new Set(zips);
        visitedCountries = new Set(countries);

        allData.forEach(location => {
            var popupText = `${location.city || ''}${location.city && location.state ? ', ' : ''}${location.state || ''}`;
            addMarker(location.lat, location.lon, popupText, location);
        });

        updateChart();
        updateStatesTable();
        updateCitiesTable();
        updateCountriesTable();
        updateZipCodesTable();

        // Initialize heatmap with loaded data
        updateHeatmap();
    }
}

// Call loadData when the application starts
loadData();