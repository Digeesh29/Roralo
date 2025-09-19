import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';        
import dotenv from 'dotenv';
dotenv.config();
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
const port = 3000;
const API_URL = "https://test.api.amadeus.com/v2/shopping/flight-offers";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'roralo'));
const https = await import('https');
const agent = new https.Agent({ family: 4 });
app.get('/', (req, res) => {
  res.render('index.ejs');
});
async function getAirlineNames(accessToken, airlineCodes) {
  try {
    const codeList = airlineCodes.join(',');
    const response = await axios.get(
      'https://test.api.amadeus.com/v1/reference-data/airlines',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { airlineCodes: codeList }
      }
    );
    const airlinesMap = {};
    response.data.data.forEach(airline => {
      airlinesMap[airline.iataCode] = airline.commonName || airline.businessName;
    });

    return airlinesMap;
  } catch (err) {
    console.error("Error fetching airline names:", err.message);
    return {}; 
  }
}
function formatFlights(amadeusData, airlineNames) {
  return amadeusData.map(flight => {
    const firstSegment = flight.itineraries[0].segments[0];
    const lastSegment =
      flight.itineraries[0].segments[flight.itineraries[0].segments.length - 1];

    const airlineCode = flight.validatingAirlineCodes[0];
    const airlineName = airlineNames[airlineCode] || airlineCode; // fallback

    return {
      airline: airlineName,
      flightNo: `${firstSegment.carrierCode} ${firstSegment.number}`,
      depTime: new Date(firstSegment.departure.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      from: firstSegment.departure.iataCode,
      arrTime: new Date(lastSegment.arrival.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      to: lastSegment.arrival.iataCode,
      duration: formatDuration(flight.itineraries[0].duration),
      stops: flight.itineraries[0].segments.length > 1
        ? `${flight.itineraries[0].segments.length - 1} Stop(s)`
        : "Non-stop",
      price: parseFloat(flight.price.total),
      logo: `https://placehold.co/40x40/333/fff?text=${airlineCode}`,
      id: flight.id
    };
  });
}

app.get('/flights', async (req, res) => {
    const { from, to, date, passengers } = req.query;
    try {
        const tokenResponse = await axios.post(
            'https://test.api.amadeus.com/v1/security/oauth2/token',
            new URLSearchParams({ 
                grant_type: 'client_credentials',
                client_id: process.env.AMADEUS_CLIENT_ID,
                client_secret: process.env.AMADEUS_CLIENT_SECRET   
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                httpsAgent: agent
            }
        );
        const accessToken = tokenResponse.data.access_token;
        const flightsResponse = await axios.get(API_URL, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            params: {
                originLocationCode: from,
                destinationLocationCode: to,
                departureDate: date,
                adults: passengers,
            }
        });

        const flights = flightsResponse.data.data;
        const airlineCodes = [...new Set(flights.map(f => f.validatingAirlineCodes[0]))];
        const airlineNames = await getAirlineNames(accessToken, airlineCodes);
        const formattedFlights = formatFlights(flights, airlineNames);

        res.render('flights.ejs', { flights: formattedFlights });
    } catch (error) {
        console.error('Error fetching flights:', error);
        res.status(500).send('Internal Server Error');
    }
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

