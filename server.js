const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Pricing factors in Kenyan Shillings (KES)
const baseFare = 150;
const costPerKilometer = 30;
const costPerMinute = 7;
const driverRatingAdjustment = 0.05;
const carCategoryMultipliers = {
  economy: 1.0,
  economyplus: 1.5,
  motorbike: 0.6,
  motorbikeelectric: 0.4,
  xl: 2.0,
};

// Car categories
let carCategories = [
  { id: 1, name: "Economy", maxPassengers: 3, engineCapacity: 650 },
  { id: 2, name: "Economy Plus", maxPassengers: 4, engineCapacity: 1000 },
  { id: 3, name: "Motor Bike", maxPassengers: 1, engineCapacity: 150 },
  { id: 4, name: "Motor Bike Electric", maxPassengers: 1, engineCapacity: 100 },
  { id: 5, name: "XL", maxPassengers: 7, engineCapacity: 1500 },
];

const rushHours = {
  morning: { start: "07:00", end: "09:00" },
  evening: { start: "17:00", end: "19:00" },
};

const parseTime = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now;
};

const isRushHour = (currentTime) => {
  const morningStart = parseTime(rushHours.morning.start);
  const morningEnd = parseTime(rushHours.morning.end);
  const eveningStart = parseTime(rushHours.evening.start);
  const eveningEnd = parseTime(rushHours.evening.end);

  return (
    (currentTime >= morningStart && currentTime <= morningEnd) ||
    (currentTime >= eveningStart && currentTime <= eveningEnd)
  );
};

// Fetch traffic data for surge multiplier
const getTrafficMultiplier = async (origin, destination) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json`,
      {
        params: {
          origin,
          destination,
          key: apiKey,
          departure_time: "now",
          traffic_model: "best_guess",
        },
      }
    );

    const routes = response.data.routes;
    if (routes && routes.length > 0) {
      const legs = routes[0].legs;
      if (legs && legs.length > 0) {
        const trafficSpeed = legs[0].duration_in_traffic.value;
        const normalSpeed = legs[0].duration.value;
        const delay = trafficSpeed - normalSpeed;
        if (delay > 400) {
          return 1.5;
        }
      }
    }
    return 1.0;
  } catch (error) {
    console.error("Error fetching traffic data:", error);
    return 1.0;
  }
};

// Fetch weather-based adjustment
const getWeatherAdjustment = async (latitude, longitude) => {
  try {

    const weatherApiKey = process.env.OPENWEATHER_API_KEY;
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${weatherApiKey}`;
    const weatherResponse = await axios.get(weatherUrl);
    
    const weatherCondition = weatherResponse.data.weather[0].main.toLowerCase();
    console.log(weatherCondition);

    switch (weatherCondition) {
      case "thunderstorm":
        return 200;
      case "rain":
        return 170;
      case "drizzle":
        return 130;
      case "fog":
      case "mist":
        return 90;
      default:
        return 0;
    }
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return 0;
  }
};

// Calculate and return prices for all categories
app.post("/calculate-prices", async (req, res) => {
  const {
    distance,
    duration,
    driverRating,
    origin,
    destination,
    tripTime,
    latitude,
    longitude,
  } = req.body;

  const currentTime = tripTime ? new Date(tripTime) : new Date();
  const distanceCost = distance * costPerKilometer;
  const timeCost = duration * costPerMinute;
  const baseCost = baseFare + distanceCost + timeCost;

  let surgeMultiplier = 1.0;
  if (isRushHour(currentTime)) {
    surgeMultiplier += 0.5;
  }

  const trafficMultiplier = await getTrafficMultiplier(origin, destination);
  surgeMultiplier *= trafficMultiplier;

  const weatherAdjustment = await getWeatherAdjustment(latitude, longitude);

  const prices = carCategories.map((category) => {
    const carCategoryMultiplier =
      carCategoryMultipliers[category.name.toLowerCase().replace(" ", "")] ||
      1.0;
    let tripCost = baseCost * carCategoryMultiplier;
    tripCost *= surgeMultiplier;

    if (driverRating >= 4.5) {
      tripCost -= tripCost * driverRatingAdjustment;
    } else if (driverRating < 3.0) {
      tripCost += tripCost * driverRatingAdjustment;
    }

    tripCost += weatherAdjustment;
       return {
      category: category.name,
      maxPassengers: category.maxPassengers,
      engineCapacity: category.engineCapacity,
      price: tripCost.toFixed(2),
    };
  });

  res.json({
    baseFare,
    distanceCost,
    timeCost,
    surgeMultiplier: surgeMultiplier.toFixed(2),
    weatherAdjustment,
    driverRatingAdjustment: driverRatingAdjustment * 100 + "%",
    prices,
  });
});

app.listen(port, () => {
  console.log(`Pricing service is running at http://localhost:${port}`);
});
