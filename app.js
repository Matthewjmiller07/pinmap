// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWF0dGhld2ptaWxsZXI3IiwiYSI6ImNtM3FldDJnbDBuanAybW9ocDBiYjRiN3AifQ.IajKfJWkk1hh89U6bU6fKQ';

// Initialize the map
var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-96, 37.8], // Centered over the USA
    zoom: 3
});

// Add navigation controls to the map
map.addControl(new mapboxgl.NavigationControl());

// Data structures to store visited locations
var visitedStates = new Set();
var visitedCities = new Set();
var visitedZipCodes = new Set();
var allData = []; // Stores all visited locations

// Function to add a marker to the map
function addMarker(lat, lon, popupText) {
    var marker = new mapboxgl.Marker()
        .setLngLat([lon, lat])
        .setPopup(new mapboxgl.Popup().setHTML(popupText))
        .addTo(map);
}

// Function to update the chart using D3.js
function updateChart() {
    // Clear previous chart
    d3.select('#chart').html('');

    // Data for the chart
    var data = [
        { label: 'States', value: visitedStates.size },
        { label: 'Cities', value: visitedCities.size }
        // ZIP codes are stored for future implementation
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
    var username = 'YOUR_GEONAMES_USERNAME'; // Replace with your GeoNames username
    var url = '';

    if (type === 'city') {
        url = `https://secure.geonames.org/searchJSON?q=${encodeURIComponent(query)}&maxRows=1&username=${username}`;
    } else if (type === 'state') {
        url = `https://secure.geonames.org/searchJSON?adminCode1=${encodeURIComponent(query)}&country=US&maxRows=1&username=${username}`;
    } else if (type === 'zip') {
        url = `https://secure.geonames.org/postalCodeSearchJSON?postalcode=${encodeURIComponent(query)}&country=US&maxRows=1&username=${username}`;
    }

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if ((data.geonames && data.geonames.length > 0) || (data.postalCodes && data.postalCodes.length > 0)) {
                var result = data.geonames ? data.geonames[0] : data.postalCodes[0];
                var lat = parseFloat(result.lat);
                var lon = parseFloat(result.lng || result.lon);
                var state = result.adminName1;
                var city = result.name || result.placeName;
                var zip = result.postalcode || query;

                // Add to data structures
                if (state) visitedStates.add(state);
                if (city) visitedCities.add(city);
                if (zip) visitedZipCodes.add(zip); // Stored for future implementation

                allData.push({
                    lat,
                    lon,
                    city,
                    state,
                    zip
                });

                // Add marker
                var popupText = `${city || ''}${city && state ? ', ' : ''}${state || ''}`;
                addMarker(lat, lon, popupText);

                // Update chart
                updateChart();

                // Save data
                saveData();
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
        // For states, we use a predefined location to place the marker
        // Alternatively, you could fetch the state's centroid or capital
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

// Map click event
map.on('click', function(e) {
    var lon = e.lngLat.lng;
    var lat = e.lngLat.lat;

    // Reverse geocoding to get city and state
    var username = 'YOUR_GEONAMES_USERNAME'; // Replace with your GeoNames username
    var url = `https://secure.geonames.org/findNearbyPlaceNameJSON?lat=${lat}&lng=${lon}&username=${username}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.geonames && data.geonames.length > 0) {
                var result = data.geonames[0];
                var state = result.adminName1;
                var city = result.name;

                // Add to data structures
                if (state) visitedStates.add(state);
                if (city) visitedCities.add(city);

                allData.push({
                    lat,
                    lon,
                    city,
                    state
                    // ZIP code is not available in this case
                });

                // Add marker
                var popupText = `${city}, ${state}`;
                addMarker(lat, lon, popupText);

                // Update chart
                updateChart();

                // Save data
                saveData();
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
}

// Load data from localStorage
function loadData() {
    var data = JSON.parse(localStorage.getItem('allData'));
    var states = JSON.parse(localStorage.getItem('visitedStates'));
    var cities = JSON.parse(localStorage.getItem('visitedCities'));
    var zips = JSON.parse(localStorage.getItem('visitedZipCodes'));

    if (data) {
        allData = data;
        visitedStates = new Set(states);
        visitedCities = new Set(cities);
        visitedZipCodes = new Set(zips);

        allData.forEach(location => {
            var popupText = `${location.city || ''}${location.city && location.state ? ', ' : ''}${location.state || ''}`;
            addMarker(location.lat, location.lon, popupText);
        });

        updateChart();
    }
}

// Call loadData when the application starts
loadData();